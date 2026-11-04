import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import { linkPhoneToAccount } from '@/lib/account-delete';
import { listLinkedAccountStatuses } from '@/lib/auth-identities';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/identities/phone');
    if (!limited.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: NO_STORE },
      );
    }

    const body = (await request.json().catch(() => null)) as { phone?: string } | null;
    const phone = body?.phone?.trim() ?? '';

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

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '휴대전화를 등록할 수 있는 관리자 키가 없습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const updated = await linkPhoneToAccount(admin, data.user, phone);
    return NextResponse.json(
      { data: { accounts: listLinkedAccountStatuses(updated) } },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.warn('[SponsorAuction] 휴대전화 연동 예외', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '휴대전화를 연동하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
