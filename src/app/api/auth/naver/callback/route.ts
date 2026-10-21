import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import {
  NAVER_NEXT_COOKIE,
  NAVER_STATE_COOKIE,
  exchangeNaverCode,
  fetchNaverProfile,
  getNaverOAuthEnv,
  naverCallbackUrl,
  readStoredNext,
  requestOrigin,
} from '@/lib/naver-oauth';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { upsertAppProfile } from '@/lib/supabase/profile-sync';

function loginError(origin: string, message: string) {
  const login = new URL('/login', origin);
  login.searchParams.set('reason', 'auth-required');
  login.searchParams.set('oauth_error', message);
  const response = NextResponse.redirect(login);
  response.cookies.delete(NAVER_STATE_COOKIE);
  response.cookies.delete(NAVER_NEXT_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/naver/callback');
    if (!limited.allowed) {
      return loginError(requestOrigin(request), '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.');
    }

    const origin = requestOrigin(request);
    const url = new URL(request.url);
    const code = url.searchParams.get('code')?.trim() ?? '';
    const state = url.searchParams.get('state')?.trim() ?? '';
    const naverError = url.searchParams.get('error_description') || url.searchParams.get('error');

    if (naverError) {
      return loginError(origin, decodeURIComponent(naverError.replace(/\+/g, ' ')));
    }

    const expectedState = request.cookies.get(NAVER_STATE_COOKIE)?.value ?? '';
    const next = readStoredNext(request.cookies.get(NAVER_NEXT_COOKIE)?.value);

    if (!code || !state || !expectedState || state !== expectedState) {
      return loginError(origin, '네이버 로그인 검증에 실패했습니다. 다시 시도해 주세요.');
    }

    const env = getNaverOAuthEnv();
    if (!env) {
      return loginError(origin, '네이버 로그인 설정이 없습니다.');
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
        origin,
        'Supabase 서비스 키가 없어 네이버 계정을 연결할 수 없습니다.',
      );
    }

    const metadata = {
      name: profile.name,
      full_name: profile.name,
      avatar_url: profile.avatarUrl,
      provider: 'naver',
      naver_id: profile.id,
    };

    const created = await admin.auth.admin.createUser({
      email: profile.email,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: { provider: 'naver', providers: ['naver'] },
    });

    if (created.error && !/already|registered|exists/i.test(created.error.message)) {
      console.warn('[SponsorAuction] 네이버 사용자 생성 실패', created.error.message);
      return loginError(origin, '네이버 계정으로 가입하지 못했습니다.');
    }

    let authUserId = created.data.user?.id ?? '';
    if (!authUserId) {
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      authUserId =
        listed.data.users.find((item) => item.email?.toLowerCase() === profile.email.toLowerCase())
          ?.id ?? '';
    }
    if (authUserId) {
      await upsertAppProfile(admin, {
        id: authUserId,
        name: profile.name,
        email: profile.email,
      });
    }

    const link = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
      options: {
        data: metadata,
        redirectTo: `${origin}${next}`,
      },
    });

    const tokenHash = link.data.properties?.hashed_token;
    if (link.error || !tokenHash) {
      console.warn('[SponsorAuction] 네이버 세션 링크 생성 실패', link.error?.message);
      return loginError(origin, '네이버 로그인 세션을 만들지 못했습니다.');
    }

    const complete = new URL('/auth/oauth', origin);
    complete.searchParams.set('token_hash', tokenHash);
    complete.searchParams.set('type', 'magiclink');
    complete.searchParams.set('next', next);
    const response = NextResponse.redirect(complete);
    response.cookies.delete(NAVER_STATE_COOKIE);
    response.cookies.delete(NAVER_NEXT_COOKIE);
    return response;
  } catch (error) {
    const detail = error instanceof Error ? error.message : '네이버 로그인에 실패했습니다.';
    console.warn('[SponsorAuction] 네이버 콜백 처리 예외', error);
    return loginError(requestOrigin(request), detail);
  }
}
