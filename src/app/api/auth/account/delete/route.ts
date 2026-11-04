import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import { deleteAccountCompletely } from '@/lib/account-delete';
import { expireAuthDebrisCookies } from '@/lib/auth-paths';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/account/delete');
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

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '계정을 삭제할 수 있는 관리자 키가 없습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    await deleteAccountCompletely(admin, data.user.id);
    await supabase.auth.signOut().catch(() => undefined);

    const response = NextResponse.json({ data: { deleted: true } }, { headers: NO_STORE });
    expireAuthDebrisCookies(request, response);
    applyAuthCookies(response.cookies, { present: false });
    return response;
  } catch (error) {
    console.warn('[SponsorAuction] 회원 탈퇴 예외', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '회원 탈퇴를 완료하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
