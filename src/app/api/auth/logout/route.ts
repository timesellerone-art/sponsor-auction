import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ACTIVE_ROLE_COOKIE_NAME,
  AUTH_PRESENT_COOKIE_NAME,
  applyAuthCookies,
  ROLE_COOKIE_NAME,
} from '@/lib/access';
import { ACCOUNT_LINK_COOKIE } from '@/lib/account-link';
import { OAUTH_NEXT_COOKIE, OAUTH_PROVIDER_COOKIE } from '@/lib/auth-guard';
import { NAVER_AUTH_COOKIE_NAMES } from '@/lib/auth-logout';
import {
  expireAuthDebrisCookies,
  expireNamedCookies,
  isPkceVerifierCookieName,
  isSupabaseAuthCookieName,
} from '@/lib/auth-paths';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { requestAppOrigin } from '@/lib/site-origin';
import { createClient } from '@/lib/supabase/server';
import { NAVER_NEXT_COOKIE, NAVER_STATE_COOKIE } from '@/lib/naver-oauth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/logout');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const supabase = await createClient();
    if (supabase) {
      await supabase.auth.signOut().catch(() => undefined);
    }

    const origin = requestAppOrigin(request);
    const hostname = new URL(origin).hostname;
    const secure = origin.startsWith('https://');
    const response = NextResponse.json({ ok: true }, { headers: NO_STORE });
    const names = new Set<string>([
      NAVER_STATE_COOKIE,
      NAVER_NEXT_COOKIE,
      ACCOUNT_LINK_COOKIE,
      OAUTH_NEXT_COOKIE,
      OAUTH_PROVIDER_COOKIE,
      ROLE_COOKIE_NAME,
      ACTIVE_ROLE_COOKIE_NAME,
      AUTH_PRESENT_COOKIE_NAME,
      ...NAVER_AUTH_COOKIE_NAMES,
    ]);
    for (const cookie of request.cookies.getAll()) {
      if (
        isSupabaseAuthCookieName(cookie.name) ||
        isPkceVerifierCookieName(cookie.name) ||
        cookie.name.startsWith('sb-')
      ) {
        names.add(cookie.name);
      }
    }
    expireNamedCookies(response.cookies, names, { secure, hostname });
    applyAuthCookies(response.cookies, { present: false, roles: [], hostname });
    expireAuthDebrisCookies(request, response, { secure, hostname });
    return response;
  } catch (error) {
    console.warn('[SponsorAuction] 로그아웃 쿠키 정리 예외', error);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
}
