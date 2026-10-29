import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import {
  OAUTH_NEXT_COOKIE,
  OAUTH_PROVIDER_COOKIE,
  ROLE_SELECT_PATH,
  describeOAuthError,
  isOAuthStateLost,
  oauthFailedLoginPath,
  oauthRetryLoginPath,
  postSocialAuthPath,
  sanitizeNextPath,
} from '@/lib/auth-guard';
import { createCookieBag, isPkceVerifierCookieName, writeCookies } from '@/lib/auth-paths';
import { getSupabaseEnv } from '@/lib/supabase/env';
import {
  PENDING_MERGE_COOKIE,
  completePendingMerge,
  reconcileSocialIdentities,
} from '@/lib/auth-identity';
import {
  isMemberRole,
  needsRoleOnboarding,
  parseAuthRoles,
  primaryAuthRole,
  type SessionUser,
} from '@/types/auth';

function callbackOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    return `${forwardedProto === 'http' ? 'http' : 'https'}://${forwardedHost}`;
  }
  return url.origin;
}

function readNext(request: NextRequest, requestUrl: URL) {
  const fromQuery = sanitizeNextPath(requestUrl.searchParams.get('next'));
  if (fromQuery) {
    return fromQuery;
  }
  const stored = request.cookies.get(OAUTH_NEXT_COOKIE)?.value;
  if (!stored) {
    return ROLE_SELECT_PATH;
  }
  try {
    return sanitizeNextPath(decodeURIComponent(stored)) ?? ROLE_SELECT_PATH;
  } catch {
    return ROLE_SELECT_PATH;
  }
}

function failRedirect(
  origin: string,
  stage: string,
  detail: { message: string; code?: string | null; status?: number | null },
) {
  console.error('[SponsorAuction] OAuth 콜백 실패', {
    stage,
    message: detail.message,
    code: detail.code ?? null,
    status: detail.status ?? null,
  });
  if (stage === 'provider' && isOAuthStateLost(detail.code, detail.message)) {
    return NextResponse.redirect(new URL(oauthRetryLoginPath(), origin));
  }
  const response = NextResponse.redirect(
    new URL(oauthFailedLoginPath(describeOAuthError(detail.message)), origin),
  );
  response.cookies.delete(OAUTH_NEXT_COOKIE);
  response.cookies.delete(OAUTH_PROVIDER_COOKIE);
  return response;
}

async function sessionLikeFor(
  supabase: ReturnType<typeof createServerClient>,
  authUser: User,
): Promise<SessionUser> {
  const profile = await supabase
    .from('profiles')
    .select('role, roles')
    .eq('id', authUser.id)
    .maybeSingle();
  const roles = parseAuthRoles(
    profile.data?.roles,
    profile.data?.role,
    authUser.user_metadata?.roles,
    authUser.user_metadata?.role,
  );
  return {
    id: authUser.id,
    email: authUser.email?.includes('@')
      ? authUser.email
      : `user.${authUser.id.replace(/-/g, '').slice(0, 12)}@oauth.sponsor-auction.local`,
    name: '',
    role: primaryAuthRole(roles),
    roles,
    createdAt: authUser.created_at,
    lastSignInAt: authUser.last_sign_in_at,
    onboardingComplete: authUser.user_metadata?.onboarding_complete === true,
    currentMode: isMemberRole(authUser.user_metadata?.current_mode)
      ? authUser.user_metadata.current_mode
      : null,
  };
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = callbackOrigin(request);
  const code = requestUrl.searchParams.get('code');
  const providerError = requestUrl.searchParams.get('error');

  if (providerError) {
    return failRedirect(origin, 'provider', {
      message: requestUrl.searchParams.get('error_description') || providerError,
      code: requestUrl.searchParams.get('error_code') || providerError,
    });
  }

  if (!code) {
    // 암묵적(implicit) 흐름은 토큰이 URL 해시로 오므로 클라이언트 페이지에서 처리한다.
    return NextResponse.redirect(new URL('/auth/oauth', origin));
  }

  const env = getSupabaseEnv();
  if (!env) {
    return failRedirect(origin, 'config', { message: 'Supabase 환경 변수가 설정되지 않았습니다.' });
  }

  const cookieBag = createCookieBag();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        cookieBag.remember(cookiesToSet);
      },
    },
  });

  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error || !exchanged.data.session) {
    return failRedirect(origin, 'exchange', {
      message: exchanged.error?.message || '세션이 발급되지 않았습니다.',
      code: exchanged.error?.code,
      status: exchanged.error?.status,
    });
  }

  let authUser = exchanged.data.user ?? exchanged.data.session.user;
  try {
    const pending = await completePendingMerge(
      request.cookies.get(PENDING_MERGE_COOKIE)?.value,
      authUser,
    );
    authUser = pending.user;
  } catch (error) {
    return failRedirect(origin, 'pending-merge', {
      message: error instanceof Error ? error.message : '계정 통합에 실패했습니다.',
    });
  }

  const linked = await reconcileSocialIdentities(authUser);
  if (linked.switched) {
    if (!linked.tokenHash) {
      return failRedirect(origin, 'account-merge', {
        message: '통합 계정 세션 링크를 만들지 못했습니다.',
      });
    }
    const verified = await supabase.auth.verifyOtp({
      token_hash: linked.tokenHash,
      type: 'magiclink',
    });
    if (verified.error || !verified.data.user) {
      return failRedirect(origin, 'account-merge', {
        message: verified.error?.message || '통합 계정 세션 전환에 실패했습니다.',
        code: verified.error?.code,
        status: verified.error?.status,
      });
    }
    authUser = verified.data.user;
  } else {
    authUser = linked.user;
  }

  const sessionLike = await sessionLikeFor(supabase, authUser);
  const destination = postSocialAuthPath(sessionLike, readNext(request, requestUrl), {
    needsOnboarding: needsRoleOnboarding(sessionLike),
  });
  const redirect = NextResponse.redirect(new URL(destination, origin));
  const issued = cookieBag.getAll();
  request.cookies
    .getAll()
    .filter(
      (cookie) =>
        isPkceVerifierCookieName(cookie.name) && !issued.some((item) => item.name === cookie.name),
    )
    .forEach((cookie) => {
      redirect.cookies.set(cookie.name, '', { path: '/', maxAge: 0, sameSite: 'lax' });
    });
  writeCookies(redirect.cookies, issued, { secure: origin.startsWith('https://') });
  redirect.cookies.delete(OAUTH_NEXT_COOKIE);
  redirect.cookies.delete(OAUTH_PROVIDER_COOKIE);
  redirect.cookies.delete(PENDING_MERGE_COOKIE);
  applyAuthCookies(redirect.cookies, {
    present: true,
    roles: destination === ROLE_SELECT_PATH ? [] : sessionLike.roles,
    activeRole:
      destination === ROLE_SELECT_PATH ? null : sessionLike.currentMode ?? sessionLike.roles,
  });
  return redirect;
}
