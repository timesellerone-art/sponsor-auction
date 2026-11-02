import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCOUNT_LINK_COOKIE,
  readAccountLinkUserId,
} from '@/lib/account-link';
import { completeMagicLinkSession } from '@/lib/auth-complete';
import { describeOAuthError, oauthFailedLoginPath } from '@/lib/auth-guard';
import { mergeUserInto } from '@/lib/auth-identity';
import { expireAuthDebrisCookies } from '@/lib/auth-paths';
import { readNaverIdpState, signNaverIdpTicket } from '@/lib/naver-idp';
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
  shouldAcceptNaverOAuthCallback,
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
    const idpState = readNaverIdpState(state);

    if (
      !shouldAcceptNaverOAuthCallback({
        code,
        state,
        expectedState,
        signedIdp: Boolean(idpState),
      })
    ) {
      return loginError(request, origin, '네이버 로그인 검증에 실패했습니다. 다시 시도해 주세요.');
    }
    if (!expectedState && !idpState) {
      console.warn('[SponsorAuction] 네이버 state 쿠키가 없어 URL state로 병합을 이어갑니다.');
    }

    const env = getNaverOAuthEnv();
    if (!env) {
      console.warn('[SponsorAuction] 네이버 OAuth 환경변수 없음', {
        missing: missingNaverOAuthEnvKeys(),
      });
      return loginError(request, origin, '네이버 로그인 설정이 없습니다.');
    }

    const callbackOrigin = idpState?.o || origin;
    const profile = await fetchNaverProfile(
      await exchangeNaverCode({
        clientId: env.clientId,
        clientSecret: env.clientSecret,
        code,
        state,
        redirectUri: naverCallbackUrl(callbackOrigin),
      }),
    );

    if (idpState) {
      const ticket = signNaverIdpTicket(profile);
      const redirect = new URL(idpState.r);
      redirect.searchParams.set('code', ticket);
      redirect.searchParams.set('state', idpState.s);
      const response = NextResponse.redirect(redirect);
      response.cookies.delete(NAVER_STATE_COOKIE);
      response.cookies.delete(NAVER_NEXT_COOKIE);
      return response;
    }

    const admin = createAdminClient();
    if (!admin) {
      return loginError(
        request,
        origin,
        'Supabase 서비스 키가 없어 네이버 계정을 연결할 수 없습니다.',
      );
    }

    let tokenHash: string | null = null;
    try {
      const linked = await linkNaverProfile(
        admin,
        profile,
        (incoming, canonical) => mergeUserInto(incoming, canonical, { phone: profile.phone }),
        async (email) => {
          const link = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo: `${origin}${next}` },
          });
          if (link.error || !link.data.properties?.hashed_token) {
            console.warn('[SponsorAuction] 네이버 세션 링크 생성 실패', link.error?.message);
            return null;
          }
          return link.data.properties.hashed_token;
        },
        {
          preferredUserId: readAccountLinkUserId(request.cookies.get(ACCOUNT_LINK_COOKIE)?.value),
        },
      );
      tokenHash = linked.tokenHash;
    } catch (error) {
      console.warn('[SponsorAuction] 네이버 계정 병합 예외', error);
      return loginError(
        request,
        origin,
        error instanceof Error ? error.message : '네이버 계정 병합에 실패했습니다.',
      );
    }
    if (!tokenHash) {
      return loginError(request, origin, '네이버 로그인 세션을 만들지 못했습니다.');
    }

    try {
      const redirect = await completeMagicLinkSession({
        request,
        origin,
        tokenHash,
        type: 'magiclink',
        next,
      });
      redirect.cookies.delete(NAVER_STATE_COOKIE);
      redirect.cookies.delete(NAVER_NEXT_COOKIE);
      return redirect;
    } catch (error) {
      console.warn('[SponsorAuction] 네이버 세션 쿠키 발급 예외, 클라이언트 교환으로 전환', error);
      const fallback = new URL('/auth/oauth', origin);
      fallback.searchParams.set('token_hash', tokenHash);
      fallback.searchParams.set('type', 'magiclink');
      fallback.searchParams.set('next', next);
      fallback.searchParams.set('client', '1');
      fallback.searchParams.set('linked', '1');
      const response = NextResponse.redirect(fallback);
      response.cookies.delete(NAVER_STATE_COOKIE);
      response.cookies.delete(NAVER_NEXT_COOKIE);
      return response;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : '네이버 로그인에 실패했습니다.';
    console.warn('[SponsorAuction] 네이버 콜백 처리 예외', error);
    return loginError(request, requestOrigin(request), detail);
  }
}
