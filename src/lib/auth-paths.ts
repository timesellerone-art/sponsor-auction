import { AUTH_COOKIE_MAX_AGE, AUTH_PRESENT_COOKIE_NAME } from '@/lib/access';
import { POST_AUTH_HOME, ROLE_SELECT_PATH } from '@/lib/auth-guard';
import { authCookieDomain } from '@/lib/site-origin';

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
  return (
    pathname === '/auth/callback' ||
    pathname.startsWith('/auth/callback/') ||
    pathname.startsWith('/api/auth/naver') ||
    pathname === '/api/auth/session/complete'
  );
}

/** getUser() JWT 검증이 필요한 보호 경로. 홈·로그인 등 공개 페이지는 쿠키 힌트만 쓴다. */
export function needsProtectedAuthValidation(pathname: string) {
  return (
    pathname === '/my' ||
    pathname.startsWith('/my/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/payments' ||
    pathname.startsWith('/payments/')
  );
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
  if (
    pathname === '/onboarding' ||
    pathname === '/select-role' ||
    pathname.startsWith('/onboarding/')
  ) {
    return POST_AUTH_HOME;
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
  defaults: { secure?: boolean; maxAge?: number } = {},
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
      maxAge: options?.maxAge ?? defaults.maxAge,
      httpOnly: options?.httpOnly,
      secure: options?.secure ?? defaults.secure,
      sameSite,
    });
  });
}

export function isPkceVerifierCookieName(name: string) {
  return name.includes('-auth-token') && name.endsWith('-code-verifier');
}

/** 실패한 OAuth 교환이 빈 세션 쿠키를 심어 기존 로그인을 지우지 않게 한다. */
export function shouldApplyRequestCookie(name: string, value: string) {
  if (value) {
    return true;
  }
  return !isSupabaseAuthCookieName(name);
}

type ExpireCookieStore = {
  set: (
    name: string,
    value: string,
    options: {
      path: string;
      maxAge: number;
      sameSite: 'lax';
      secure?: boolean;
      domain?: string;
    },
  ) => void;
};

export function expireNamedCookie(
  store: ExpireCookieStore,
  name: string,
  defaults: { secure?: boolean; hostname?: string | null } = {},
) {
  const base = {
    path: '/',
    maxAge: 0,
    sameSite: 'lax' as const,
    ...(defaults.secure ? { secure: true } : {}),
  };
  store.set(name, '', base);
  const domain = authCookieDomain(defaults.hostname);
  if (domain) {
    store.set(name, '', { ...base, domain });
  }
}

export function expireNamedCookies(
  store: ExpireCookieStore,
  names: Iterable<string>,
  defaults: { secure?: boolean; hostname?: string | null } = {},
) {
  for (const name of names) {
    expireNamedCookie(store, name, defaults);
  }
}

export function expirePkceVerifierCookies(
  request: { cookies: { getAll: () => Array<{ name: string }> } },
  response: { cookies: ExpireCookieStore },
  defaults: { secure?: boolean; hostname?: string | null } = {},
) {
  for (const cookie of request.cookies.getAll()) {
    if (!isPkceVerifierCookieName(cookie.name)) {
      continue;
    }
    expireNamedCookie(response.cookies, cookie.name, defaults);
  }
}

/** 예전 본인 확인 병합 플로우가 남긴 쿠키. 지금은 즉시 병합하므로 만료시킨다. */
export const LEGACY_PENDING_MERGE_COOKIE = 'sponsor-auction-merge-from';

export function isAuthDebrisCookieName(name: string) {
  return name === LEGACY_PENDING_MERGE_COOKIE;
}

export function sessionCookieOptions(secure?: boolean, hostname?: string | null) {
  const domain = authCookieDomain(hostname);
  return {
    path: '/' as const,
    sameSite: 'lax' as const,
    maxAge: AUTH_COOKIE_MAX_AGE,
    ...(typeof secure === 'boolean' ? { secure } : {}),
    ...(domain ? { domain } : {}),
  };
}

export function expireAuthDebrisCookies(
  request: { cookies: { getAll: () => Array<{ name: string }> } },
  response: { cookies: ExpireCookieStore },
  defaults: { secure?: boolean; hostname?: string | null } = {},
) {
  for (const cookie of request.cookies.getAll()) {
    if (!isAuthDebrisCookieName(cookie.name)) {
      continue;
    }
    expireNamedCookie(response.cookies, cookie.name, defaults);
  }
}
