import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import {
  ACCOUNT_LINK_COOKIE,
  readAccountLinkUserId,
} from '@/lib/account-link';
import {
  completeMagicLinkSessionDetailed,
  redirectExistingAuthUser,
} from '@/lib/auth-complete';
import { describeOAuthError, oauthFailedLoginPath } from '@/lib/auth-guard';
import { mergeUserInto } from '@/lib/auth-identity';
import { expireAuthDebrisCookies } from '@/lib/auth-paths';
import { shareOAuthAttempt } from '@/lib/oauth-once';
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

async function resumeOrLoginError(request: NextRequest, origin: string, next: string, message: string) {
  const resumed = await redirectExistingAuthUser({ request, origin, next });
  if (resumed) {
    resumed.cookies.delete(NAVER_STATE_COOKIE);
    resumed.cookies.delete(NAVER_NEXT_COOKIE);
    return resumed;
  }
  return loginError(request, origin, message);
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
      return resumeOrLoginError(
        request,
        origin,
        readStoredNext(request.cookies.get(NAVER_NEXT_COOKIE)?.value),
        decodeURIComponent(naverError.replace(/\+/g, ' ')),
      );
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
      return resumeOrLoginError(request, origin, next, '네이버 로그인 검증에 실패했습니다. 다시 시도해 주세요.');
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
    const once = await shareOAuthAttempt(`naver:${code}`, async () => {
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
        return { kind: 'idp' as const, ticket, redirect: idpState.r, gotrueState: idpState.s };
      }

      const admin = createAdminClient();
      if (!admin) {
        return {
          kind: 'error' as const,
          message: 'Supabase 서비스 키가 없어 네이버 계정을 연결할 수 없습니다.',
        };
      }

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
      if (!linked.tokenHash) {
        return { kind: 'error' as const, message: '네이버 로그인 세션을 만들지 못했습니다.' };
      }
      return { kind: 'login' as const, tokenHash: linked.tokenHash, next };
    });

    if (once.kind === 'idp') {
      const redirect = new URL(once.redirect);
      redirect.searchParams.set('code', once.ticket);
      redirect.searchParams.set('state', once.gotrueState);
      const response = NextResponse.redirect(redirect);
      response.cookies.delete(NAVER_STATE_COOKIE);
      response.cookies.delete(NAVER_NEXT_COOKIE);
      return response;
    }

    if (once.kind === 'error') {
      return resumeOrLoginError(request, origin, next, once.message);
    }

    try {
      const completed = await completeMagicLinkSessionDetailed({
        request,
        origin,
        tokenHash: once.tokenHash,
        type: 'magiclink',
        next: once.next,
      });
      completed.response.cookies.delete(NAVER_STATE_COOKIE);
      completed.response.cookies.delete(NAVER_NEXT_COOKIE);
      return completed.response;
    } catch (error) {
      const resumed = await redirectExistingAuthUser({ request, origin, next: once.next });
      if (resumed) {
        resumed.cookies.delete(NAVER_STATE_COOKIE);
        resumed.cookies.delete(NAVER_NEXT_COOKIE);
        return resumed;
      }
      console.warn('[SponsorAuction] 네이버 세션 쿠키 발급 예외, 클라이언트 교환으로 전환', error);
      const fallback = new URL('/auth/oauth', origin);
      fallback.searchParams.set('token_hash', once.tokenHash);
      fallback.searchParams.set('type', 'magiclink');
      fallback.searchParams.set('next', once.next);
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
    const origin = requestOrigin(request);
    const next = readStoredNext(request.cookies.get(NAVER_NEXT_COOKIE)?.value);
    return resumeOrLoginError(request, origin, next, detail);
  }
}
