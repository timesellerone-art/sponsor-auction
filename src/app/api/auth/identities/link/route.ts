import { connection } from 'next/server';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCOUNT_LINK_COOKIE,
  readAccountLinkUserId,
  writeAccountLinkCookie,
} from '@/lib/account-link';
import { getApiAuthUser } from '@/lib/auth-api-user';
import { reconcileSocialIdentities } from '@/lib/auth-identity';
import { expireAuthDebrisCookies } from '@/lib/auth-paths';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(request: NextRequest) {
  try {
    await connection();

    const { supabase, user, error } = await getApiAuthUser(request);
    if (error === 'unconfigured' || !supabase) {
      return NextResponse.json(
        { error: 'Supabase가 설정되지 않았습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: NO_STORE });
    }

    const cookieStore = await cookies();
    const linked = await reconcileSocialIdentities(
      user,
      readAccountLinkUserId(cookieStore.get(ACCOUNT_LINK_COOKIE)?.value),
    );
    if (linked.switched && linked.tokenHash) {
      const verified = await supabase.auth.verifyOtp({
        token_hash: linked.tokenHash,
        type: 'magiclink',
      });
      if (verified.error) {
        console.warn('[SponsorAuction] 통합 계정 세션 전환 실패', verified.error.message);
      }
    }

    const current = await supabase.auth.getUser();
    const mergedId = current.data.user?.id ?? linked.user.id;
    const secure =
      request.nextUrl.protocol === 'https:' ||
      request.headers.get('x-forwarded-proto') === 'https';
    const response = NextResponse.json(
      {
        data: {
          id: mergedId,
          email: current.data.user?.email ?? linked.user.email ?? null,
          merged: linked.switched,
        },
      },
      { headers: NO_STORE },
    );
    expireAuthDebrisCookies({ cookies: cookieStore }, response);
    writeAccountLinkCookie(response.cookies, mergedId, secure);
    return response;
  } catch (error) {
    console.error('[SponsorAuction] 소셜 계정 통합 중 예외가 발생했습니다.', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '소셜 계정을 연결하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
