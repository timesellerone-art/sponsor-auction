import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { oauthFailedLoginPath } from '@/lib/auth-guard';
import { appOriginFromIdpRequest, signNaverIdpState } from '@/lib/naver-idp';
import {
  buildNaverAuthorizeUrl,
  getNaverOAuthEnv,
  naverCallbackUrl,
} from '@/lib/naver-oauth';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/naver/idp/authorize');
    if (!limited.allowed) {
      return NextResponse.redirect(
        new URL(oauthFailedLoginPath('요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'), request.url),
      );
    }

    const env = getNaverOAuthEnv();
    if (!env) {
      return NextResponse.redirect(
        new URL(oauthFailedLoginPath('네이버 로그인 설정이 없습니다.'), request.url),
      );
    }

    const url = new URL(request.url);
    const gState = url.searchParams.get('state')?.trim() ?? '';
    const gRedirect = url.searchParams.get('redirect_uri')?.trim() ?? '';
    if (!gState || !gRedirect.includes('/auth/v1/callback')) {
      return NextResponse.redirect(
        new URL(oauthFailedLoginPath('네이버 로그인 검증에 실패했습니다. 다시 시도해 주세요.'), request.url),
      );
    }

    const origin = appOriginFromIdpRequest(request);
    const state = signNaverIdpState({ s: gState, r: gRedirect, o: origin });
    return NextResponse.redirect(
      buildNaverAuthorizeUrl({
        clientId: env.clientId,
        redirectUri: naverCallbackUrl(origin),
        state,
      }),
    );
  } catch (error) {
    console.warn('[SponsorAuction] 네이버 IdP authorize 실패', error);
    return NextResponse.redirect(
      new URL(oauthFailedLoginPath('네이버 로그인을 시작하지 못했습니다.'), request.url),
    );
  }
}
