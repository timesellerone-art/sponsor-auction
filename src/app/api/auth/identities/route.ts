import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { getApiAuthUser } from '@/lib/auth-api-user';
import { listLinkedAccountStatuses } from '@/lib/auth-identities';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET(request: Request) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/identities');
    if (!limited.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: NO_STORE },
      );
    }

    const { user, error } = await getApiAuthUser(request);
    if (error === 'unconfigured') {
      return NextResponse.json(
        { error: 'Supabase가 설정되지 않았습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: NO_STORE });
    }

    return NextResponse.json(
      {
        data: {
          id: user.id,
          name:
            (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
            null,
          email: user.email ?? null,
          phone: user.phone ?? null,
          accounts: listLinkedAccountStatuses(user),
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.warn('[SponsorAuction] 연동 계정 조회 예외', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '연동 계정을 불러오지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
