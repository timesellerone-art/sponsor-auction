import { AUTH_PRESENT_COOKIE_NAME } from '@/lib/access';
import { ROLE_SELECT_PATH } from '@/lib/auth-guard';

export function isAuthPassthroughPath(pathname: string) {
  return (
    pathname === ROLE_SELECT_PATH ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/api/onboarding') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/refund'
  );
}

export function isAuthCallbackPath(pathname: string) {
  return pathname === '/auth/callback' || pathname.startsWith('/auth/callback/');
}

export type CookieToSet = {
  name: string;
  value: string;
  options?: {
    domain?: string;
    path?: string;
    expires?: Date;
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: boolean | 'lax' | 'strict' | 'none';
  };
};

export function onboardingCanonicalPath(pathname: string) {
  if (pathname === '/onboarding' || pathname === '/select-role') {
    return ROLE_SELECT_PATH;
  }
  return null;
}

/** 세션 쿠키(분할 조각 포함)만 해당한다. OAuth 시작 시 생기는 PKCE verifier 쿠키는 로그인 상태가 아니다. */
export function isSupabaseAuthCookieName(name: string) {
  return (
    name === 'sb-access-token' ||
    name === 'sb-refresh-token' ||
    /^sb-.+-auth-token(\.\d+)?$/.test(name)
  );
}

export function hasSupabaseAuthCookie(
  cookies: Array<{ name: string; value?: string }>,
) {
  return cookies.some(
    (cookie) => Boolean(cookie.value) && isSupabaseAuthCookieName(cookie.name),
  );
}

export function hasAuthPresence(
  cookies: Array<{ name: string; value?: string }>,
) {
  return (
    cookies.some(
      (cookie) => cookie.name === AUTH_PRESENT_COOKIE_NAME && cookie.value === '1',
    ) || hasSupabaseAuthCookie(cookies)
  );
}

export function createCookieBag() {
  const items: CookieToSet[] = [];
  return {
    getAll() {
      return items;
    },
    remember(cookiesToSet: CookieToSet[]) {
      cookiesToSet.forEach((cookie) => {
        items.push(cookie);
      });
    },
  };
}

export function writeCookies(
  store: {
    set: (
      name: string,
      value: string,
      options?: {
        domain?: string;
        path?: string;
        expires?: Date;
        maxAge?: number;
        httpOnly?: boolean;
        secure?: boolean;
        sameSite?: 'lax' | 'strict' | 'none';
      },
    ) => void;
  },
  cookiesToSet: CookieToSet[],
  defaults: { secure?: boolean } = {},
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    const sameSite =
      options?.sameSite === true
        ? 'strict'
        : options?.sameSite === false
          ? 'none'
          : (options?.sameSite ?? 'lax');
    store.set(name, value, {
      domain: options?.domain,
      path: options?.path ?? '/',
      expires: options?.expires,
      maxAge: options?.maxAge,
      httpOnly: options?.httpOnly,
      secure: options?.secure ?? defaults.secure,
      sameSite,
    });
  });
}

export function isPkceVerifierCookieName(name: string) {
  return name.includes('-auth-token') && name.endsWith('-code-verifier');
}

/** 예전 본인 확인 병합 플로우가 남긴 쿠키. 지금은 즉시 병합하므로 만료시킨다. */
export const LEGACY_PENDING_MERGE_COOKIE = 'sponsor-auction-merge-from';

export function isAuthDebrisCookieName(name: string) {
  return isPkceVerifierCookieName(name) || name === LEGACY_PENDING_MERGE_COOKIE;
}

export function expireAuthDebrisCookies(
  request: { cookies: { getAll: () => Array<{ name: string }> } },
  response: {
    cookies: {
      set: (
        name: string,
        value: string,
        options: { path: string; maxAge: number; sameSite: 'lax' },
      ) => void;
    };
  },
) {
  for (const cookie of request.cookies.getAll()) {
    if (!isAuthDebrisCookieName(cookie.name)) {
      continue;
    }
    response.cookies.set(cookie.name, '', { path: '/', maxAge: 0, sameSite: 'lax' });
  }
}
