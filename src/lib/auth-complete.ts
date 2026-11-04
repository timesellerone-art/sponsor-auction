import 'server-only';

import { createServerClient } from '@supabase/ssr';
import type { User } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import {
  ACCOUNT_LINK_COOKIE,
  readAccountLinkUserId,
  writeAccountLinkCookie,
} from '@/lib/account-link';
import {
  ROLE_SELECT_PATH,
  isUsedOrExpiredOAuthCode,
  oauthFailedLoginPath,
  postSocialAuthPath,
  sanitizeNextPath,
} from '@/lib/auth-guard';
import { shareOAuthAttempt } from '@/lib/oauth-once';
import {
  createCookieBag,
  expireAuthDebrisCookies,
  isSupabaseAuthCookieName,
  sessionCookieOptions,
  shouldApplyRequestCookie,
  writeCookies,
  type CookieToSet,
} from '@/lib/auth-paths';
import { sessionUserFromAuthUser } from '@/lib/auth-session';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { needsRoleOnboarding } from '@/types/auth';

export type CompletedAuthRedirect = {
  response: NextResponse;
  destination: string;
  cookies: CookieToSet[];
};

type CachedAuthFinish = {
  user: User;
  next: string;
  cookies: CookieToSet[];
};

export function completeLoginError(request: NextRequest, origin: string, message: string) {
  const response = NextResponse.redirect(new URL(oauthFailedLoginPath(message), origin));
  expireAuthDebrisCookies(request, response);
  return response;
}

function createRequestSupabase(request: NextRequest, origin: string) {
  const env = getSupabaseEnv();
  if (!env) {
    return null;
  }
  const cookieBag = createCookieBag();
  const secure = origin.startsWith('https://');
  const supabase = createServerClient(env.url, env.anonKey, {
    cookieOptions: sessionCookieOptions(secure),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookieBag.remember(cookiesToSet);
        cookiesToSet.forEach(({ name, value }) => {
          if (!shouldApplyRequestCookie(name, value)) {
            return;
          }
          request.cookies.set(name, value);
        });
      },
    },
  });
  return { supabase, cookieBag, secure, env };
}

export async function readRequestAuthUser(request: NextRequest, origin: string): Promise<User | null> {
  const created = createRequestSupabase(request, origin);
  if (!created) {
    return null;
  }
  const { data } = await created.supabase.auth.getUser();
  return data.user ?? null;
}

export function finishAuthUserRedirect(params: {
  request: NextRequest;
  origin: string;
  user: User;
  next?: string;
  extraCookies?: CookieToSet[];
}): CompletedAuthRedirect {
  const sessionLike = sessionUserFromAuthUser(params.user);
  const next = sanitizeNextPath(params.next) ?? ROLE_SELECT_PATH;
  const destination = postSocialAuthPath(sessionLike, next, {
    needsOnboarding: needsRoleOnboarding(sessionLike),
  });
  const secure = params.origin.startsWith('https://');
  const cookies = [...(params.extraCookies ?? [])];
  const redirect = NextResponse.redirect(new URL(destination, params.origin));
  params.request.cookies.getAll().forEach((cookie) => {
    if (!isSupabaseAuthCookieName(cookie.name) || !cookie.value) {
      return;
    }
    if (cookies.some((item) => item.name === cookie.name && item.value)) {
      return;
    }
    cookies.push({ name: cookie.name, value: cookie.value });
  });
  writeCookies(redirect.cookies, cookies, { secure });
  expireAuthDebrisCookies(params.request, redirect, { secure });
  writeAccountLinkCookie(redirect.cookies, params.user.id, secure);
  applyAuthCookies(redirect.cookies, {
    present: true,
    roles: destination === ROLE_SELECT_PATH ? [] : sessionLike.roles,
    activeRole:
      destination === ROLE_SELECT_PATH ? null : sessionLike.currentMode ?? sessionLike.roles,
  });
  return { response: redirect, destination, cookies };
}

async function restoreFromAccountLinkCookie(params: {
  request: NextRequest;
  origin: string;
  next?: string;
}): Promise<NextResponse | null> {
  const linkedId = readAccountLinkUserId(params.request.cookies.get(ACCOUNT_LINK_COOKIE)?.value);
  if (!linkedId) {
    return null;
  }
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }
  const linked = await admin.auth.admin.getUserById(linkedId);
  const user = linked.data.user;
  const email = user?.email?.trim() ?? '';
  if (!user || !email.includes('@')) {
    return null;
  }

  const created = createRequestSupabase(params.request, params.origin);
  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${params.origin}${sanitizeNextPath(params.next) ?? ROLE_SELECT_PATH}` },
  });
  const tokenHash = link.data.properties?.hashed_token ?? '';
  if (created && tokenHash) {
    const verified = await created.supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'magiclink',
    });
    const authUser = verified.data.user ?? user;
    return finishAuthUserRedirect({
      request: params.request,
      origin: params.origin,
      user: authUser,
      next: params.next,
      extraCookies: created.cookieBag.getAll().filter((cookie) => Boolean(cookie.value)),
    }).response;
  }

  return finishAuthUserRedirect({
    request: params.request,
    origin: params.origin,
    user,
    next: params.next,
  }).response;
}

/** 세션 쿠키 또는 15분 연동 쿠키가 있으면 코드 재교환 없이 마이페이지로 보낸다. */
export async function redirectExistingAuthUser(params: {
  request: NextRequest;
  origin: string;
  next?: string;
  allowAccountLink?: boolean;
}): Promise<NextResponse | null> {
  const user = await readRequestAuthUser(params.request, params.origin);
  if (user) {
    return finishAuthUserRedirect({
      request: params.request,
      origin: params.origin,
      user,
      next: params.next,
    }).response;
  }
  if (params.allowAccountLink === false) {
    return null;
  }
  return restoreFromAccountLinkCookie(params);
}

function replayCachedAuth(
  request: NextRequest,
  origin: string,
  cached: CachedAuthFinish,
): CompletedAuthRedirect {
  return finishAuthUserRedirect({
    request,
    origin,
    user: cached.user,
    next: cached.next,
    extraCookies: cached.cookies,
  });
}

/** 매직링크 토큰을 서버에서 세션 쿠키로 바꾸고 바로 목적지(보통 /my)로 보낸다. */
export async function completeMagicLinkSession(params: {
  request: NextRequest;
  origin: string;
  tokenHash: string;
  type: 'magiclink' | 'email';
  next: string;
}): Promise<NextResponse> {
  return (await completeMagicLinkSessionDetailed(params)).response;
}

export async function completeMagicLinkSessionDetailed(params: {
  request: NextRequest;
  origin: string;
  tokenHash: string;
  type: 'magiclink' | 'email';
  next: string;
}): Promise<CompletedAuthRedirect> {
  const created = createRequestSupabase(params.request, params.origin);
  if (!created) {
    return {
      response: completeLoginError(
        params.request,
        params.origin,
        'Supabase 환경 변수가 설정되지 않았습니다.',
      ),
      destination: oauthFailedLoginPath('Supabase 환경 변수가 설정되지 않았습니다.'),
      cookies: [],
    };
  }

  const cached = await shareOAuthAttempt(`magic:${params.tokenHash}`, async (): Promise<CachedAuthFinish | null> => {
    const verified = await created.supabase.auth.verifyOtp({
      token_hash: params.tokenHash,
      type: params.type,
    });
    let authUser = verified.data.user ?? null;
    if (verified.error || !verified.data.session || !authUser) {
      const existing = (await created.supabase.auth.getUser()).data.user;
      if (existing && isUsedOrExpiredOAuthCode(verified.error?.message, verified.error?.code)) {
        authUser = existing;
      } else if (existing) {
        authUser = existing;
      } else {
        return null;
      }
    }

    return {
      user: authUser,
      next: params.next,
      cookies: created.cookieBag.getAll(),
    };
  });

  if (cached) {
    return replayCachedAuth(params.request, params.origin, cached);
  }

  const resumed = await redirectExistingAuthUser({
    request: params.request,
    origin: params.origin,
    next: params.next,
  });
  if (resumed) {
    return {
      response: resumed,
      destination: resumed.headers.get('location') ?? '/my',
      cookies: [],
    };
  }

  const fallback = new URL('/auth/oauth', params.origin);
  fallback.searchParams.set('token_hash', params.tokenHash);
  fallback.searchParams.set('type', params.type);
  fallback.searchParams.set('next', params.next);
  fallback.searchParams.set('client', '1');
  fallback.searchParams.set('linked', '1');
  return {
    response: NextResponse.redirect(fallback),
    destination: fallback.pathname + fallback.search,
    cookies: [],
  };
}
