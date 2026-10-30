import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import {
  ROLE_SELECT_PATH,
  oauthFailedLoginPath,
  postSocialAuthPath,
  sanitizeNextPath,
} from '@/lib/auth-guard';
import { createCookieBag, expireAuthDebrisCookies, writeCookies } from '@/lib/auth-paths';
import { sessionUserFromAuthUser } from '@/lib/auth-session';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { needsRoleOnboarding } from '@/types/auth';

export function completeLoginError(request: NextRequest, origin: string, message: string) {
  const response = NextResponse.redirect(new URL(oauthFailedLoginPath(message), origin));
  expireAuthDebrisCookies(request, response);
  return response;
}

/** 매직링크 토큰을 서버에서 세션 쿠키로 바꾸고 바로 목적지(보통 /my)로 보낸다. */
export async function completeMagicLinkSession(params: {
  request: NextRequest;
  origin: string;
  tokenHash: string;
  type: 'magiclink' | 'email';
  next: string;
}): Promise<NextResponse> {
  const env = getSupabaseEnv();
  if (!env) {
    return completeLoginError(params.request, params.origin, 'Supabase 환경 변수가 설정되지 않았습니다.');
  }

  const cookieBag = createCookieBag();
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return params.request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          params.request.cookies.set(name, value);
        });
        cookieBag.remember(cookiesToSet);
      },
    },
  });

  const verified = await supabase.auth.verifyOtp({
    token_hash: params.tokenHash,
    type: params.type,
  });
  const authUser = verified.data.user;
  if (verified.error || !verified.data.session || !authUser) {
    return completeLoginError(
      params.request,
      params.origin,
      verified.error?.message || '로그인 세션이 저장되지 않았습니다. 다시 로그인해 주세요.',
    );
  }

  const sessionLike = sessionUserFromAuthUser(authUser);
  const next = sanitizeNextPath(params.next) ?? ROLE_SELECT_PATH;
  const destination = postSocialAuthPath(sessionLike, next, {
    needsOnboarding: needsRoleOnboarding(sessionLike),
  });
  const redirect = NextResponse.redirect(new URL(destination, params.origin));
  writeCookies(redirect.cookies, cookieBag.getAll(), { secure: params.origin.startsWith('https://') });
  expireAuthDebrisCookies(params.request, redirect);
  applyAuthCookies(redirect.cookies, {
    present: true,
    roles: destination === ROLE_SELECT_PATH ? [] : sessionLike.roles,
    activeRole:
      destination === ROLE_SELECT_PATH ? null : sessionLike.currentMode ?? sessionLike.roles,
  });
  return redirect;
}
