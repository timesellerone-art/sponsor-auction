import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import { collectAuthEmails } from '@/lib/auth-emails';
import { describeOAuthError, oauthFailedLoginPath } from '@/lib/auth-guard';
import { mergeUserInto, reconcileSocialIdentities } from '@/lib/auth-identity';
import { expireAuthDebrisCookies } from '@/lib/auth-paths';
import { linkNaverProfile } from '@/lib/naver-link';
import {
  NAVER_NEXT_COOKIE,
  NAVER_STATE_COOKIE,
  exchangeNaverCode,
  fetchNaverProfile,
  getNaverOAuthEnv,
  missingNaverOAuthEnvKeys,
  naverCallbackUrl,
  readStoredNext,
  requestOrigin,
} from '@/lib/naver-oauth';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

function loginError(request: NextRequest, origin: string, message: string) {
  const response = NextResponse.redirect(
    new URL(oauthFailedLoginPath(describeOAuthError(message)), origin),
  );
  response.cookies.delete(NAVER_STATE_COOKIE);
  response.cookies.delete(NAVER_NEXT_COOKIE);
  expireAuthDebrisCookies(request, response);
  return response;
}

export async function GET(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/naver/callback');
    if (!limited.allowed) {
      return loginError(request, requestOrigin(request), '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    }

    const origin = requestOrigin(request);
    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.trim() ?? '';
    const state = url.searchParams.get('state')?.trim() ?? '';
    const naverError = url.searchParams.get('error_description') || url.searchParams.get('error');

    if (naverError) {
      return loginError(request, origin, decodeURIComponent(naverError.replace(/\+/g, ' ')));
    }

    const expectedState = request.cookies.get(NAVER_STATE_COOKIE)?.value ?? '';
    const next = readStoredNext(request.cookies.get(NAVER_NEXT_COOKIE)?.value);

    if (!code || !state || !expectedState || state !== expectedState) {
      return loginError(request, origin, '네이버 로그인 검증에 실패했습니다. 다시 시도해 주세요.');
    }

    const env = getNaverOAuthEnv();
    if (!env) {
      console.warn('[SponsorAuction] 네이버 OAuth 환경변수 없음', {
        missing: missingNaverOAuthEnvKeys(),
      });
      return loginError(request, origin, '네이버 로그인 설정이 없습니다.');
    }

    const accessToken = await exchangeNaverCode({
      clientId: env.clientId,
      clientSecret: env.clientSecret,
      code,
      state,
      redirectUri: naverCallbackUrl(origin),
    });
    const profile = await fetchNaverProfile(accessToken);

    const admin = createAdminClient();
    if (!admin) {
      return loginError(
        request,
        origin,
        'Supabase 서비스 키가 없어 네이버 계정을 연결할 수 없습니다.',
      );
    }

    const linked = await linkNaverProfile(admin, profile, (incoming, canonical) =>
      mergeUserInto(incoming, canonical, { phone: profile.phone }),
    );
    const resolved = (await reconcileSocialIdentities(linked.user)).user;
    const sessionEmail = collectAuthEmails(resolved)[0] ?? resolved.email;
    if (!sessionEmail) {
      return loginError(request, origin, '네이버 로그인 세션을 만들지 못했습니다.');
    }

    const link = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: sessionEmail,
      options: { redirectTo: `${origin}${next}` },
    });

    const tokenHash = link.data.properties?.hashed_token;
    if (link.error || !tokenHash) {
      console.warn('[SponsorAuction] 네이버 세션 링크 생성 실패', link.error?.message);
      return loginError(request, origin, '네이버 로그인 세션을 만들지 못했습니다.');
    }

    const complete = new URL('/auth/oauth', origin);
    complete.searchParams.set('token_hash', tokenHash);
    complete.searchParams.set('type', 'magiclink');
    complete.searchParams.set('next', next);
    const response = NextResponse.redirect(complete);
    response.cookies.delete(NAVER_STATE_COOKIE);
    response.cookies.delete(NAVER_NEXT_COOKIE);
    expireAuthDebrisCookies(request, response);
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : '네이버 로그인에 실패했습니다.';
    console.warn('[SponsorAuction] 네이버 콜백 처리 예외', error);
    return loginError(request, requestOrigin(request), detail);
  }
}
