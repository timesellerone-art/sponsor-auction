import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { listLinkedAccountStatuses } from '@/lib/auth-identities';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';
import { createClient } from '@/lib/supabase/server';

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

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase가 설정되지 않았습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: NO_STORE });
    }

    return NextResponse.json(
      {
        data: {
          id: data.user.id,
          email: data.user.email ?? null,
          accounts: listLinkedAccountStatuses(data.user),
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
