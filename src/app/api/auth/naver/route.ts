import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { sanitizeNextPath } from '@/lib/auth-guard';
import {
  NAVER_NEXT_COOKIE,
  NAVER_STATE_COOKIE,
  buildNaverAuthorizeUrl,
  cookieOptions,
  createNaverState,
  getNaverOAuthEnv,
  naverCallbackUrl,
  requestOrigin,
} from '@/lib/naver-oauth';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/naver');
    if (!limited.allowed) {
      return NextResponse.redirect(new URL('/login?reason=auth-required', request.url));
    }

    const origin = requestOrigin(request);
    const env = getNaverOAuthEnv();
    if (!env) {
      const login = new URL('/login', origin);
      login.searchParams.set('reason', 'auth-required');
      login.searchParams.set(
        'oauth_error',
        '네이버 로그인 설정이 없습니다. NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 확인하세요.',
      );
      return NextResponse.redirect(login);
    }

    const next =
      sanitizeNextPath(new URL(request.url).searchParams.get('next')) ?? '/';
    const state = createNaverState();
    const authorize = buildNaverAuthorizeUrl({
      clientId: env.clientId,
      redirectUri: naverCallbackUrl(origin),
      state,
    });

    const response = NextResponse.redirect(authorize);
    const cookies = cookieOptions();
    response.cookies.set(NAVER_STATE_COOKIE, state, cookies);
    response.cookies.set(NAVER_NEXT_COOKIE, next, cookies);
    return response;
  } catch (error) {
    console.warn('[SponsorAuction] 네이버 로그인 시작에 실패했습니다.', error);
    return NextResponse.redirect(new URL('/login?reason=auth-required', request.url));
  }
}
