import { NextResponse, type NextRequest } from 'next/server';
import { readAuthUserIdFromCookies, writeAccountLinkCookie } from '@/lib/account-link';
import { POST_AUTH_HOME, oauthFailedLoginPath, sanitizeNextPath } from '@/lib/auth-guard';
import { expirePkceVerifierCookies } from '@/lib/auth-paths';
import {
  NAVER_NEXT_COOKIE,
  NAVER_STATE_COOKIE,
  buildNaverAuthorizeUrl,
  cookieOptions,
  createNaverState,
  getNaverOAuthEnv,
  missingNaverOAuthEnvKeys,
  naverCallbackUrl,
  requestOrigin,
} from '@/lib/naver-oauth';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';

export const preferredRegion = 'icn1';

export async function GET(request: NextRequest) {
  try {
    const limited = consumeRateLimit(clientIp(request), '/api/auth/naver');
    if (!limited.allowed) {
      return NextResponse.redirect(
        new URL(oauthFailedLoginPath('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'), request.url),
      );
    }

    const origin = requestOrigin(request);
    const env = getNaverOAuthEnv();
    if (!env) {
      console.warn('[SponsorAuction] 네이버 OAuth 환경변수 없음', {
        missing: missingNaverOAuthEnvKeys(),
      });
      return NextResponse.redirect(
        new URL(
          oauthFailedLoginPath(
            '네이버 로그인 설정이 없습니다. NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET을 확인하세요.',
          ),
          origin,
        ),
      );
    }

    const next =
      sanitizeNextPath(new URL(request.url).searchParams.get('next')) ?? POST_AUTH_HOME;
    const state = createNaverState();
    const authorize = buildNaverAuthorizeUrl({
      clientId: env.clientId,
      redirectUri: naverCallbackUrl(origin),
      state,
    });

    const response = NextResponse.redirect(authorize);
    const secure = origin.startsWith('https://');
    const hostname = new URL(origin).hostname;
    const cookies = cookieOptions(secure, hostname);
    response.cookies.set(NAVER_STATE_COOKIE, state, cookies);
    response.cookies.set(NAVER_NEXT_COOKIE, next, cookies);
    expirePkceVerifierCookies(request, response, {
      secure,
      hostname,
    });
    const userId = readAuthUserIdFromCookies(request.cookies.getAll());
    if (userId) {
      writeAccountLinkCookie(response.cookies, userId, secure, hostname);
    }
    return response;
  } catch (error) {
    console.warn('[SponsorAuction] 네이버 로그인 시작에 실패했습니다.', error);
    return NextResponse.redirect(
      new URL(oauthFailedLoginPath('네이버 로그인을 시작하지 못했습니다.'), request.url),
    );
  }
}
