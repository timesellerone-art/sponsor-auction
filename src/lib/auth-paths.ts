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

export function isSupabaseAuthCookieName(name: string) {
  return (
    name === 'sb-access-token' ||
    name === 'sb-refresh-token' ||
    name.includes('-auth-token')
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
) {
  cookiesToSet.forEach(({ name, value, options }) => {
    const sameSite =
      options?.sameSite === true
        ? 'strict'
        : options?.sameSite === false
          ? 'none'
          : options?.sameSite;
    store.set(name, value, {
      domain: options?.domain,
      path: options?.path ?? '/',
      expires: options?.expires,
      maxAge: options?.maxAge,
      httpOnly: options?.httpOnly,
      secure: options?.secure,
      sameSite,
    });
  });
}
