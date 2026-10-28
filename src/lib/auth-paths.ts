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

export function collectSupabaseAuthCookies(
  cookies: Array<{ name: string; value?: string }>,
): CookieToSet[] {
  return cookies
    .filter((cookie) => Boolean(cookie.value) && isSupabaseAuthCookieName(cookie.name))
    .map((cookie) => ({
      name: cookie.name,
      value: cookie.value ?? '',
      options: {
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
        httpOnly: true,
        sameSite: 'lax' as const,
        secure: process.env.NODE_ENV === 'production',
      },
    }));
}

export function mergeCookiesToSet(...groups: CookieToSet[][]) {
  const merged = new Map<string, CookieToSet>();
  groups.flat().forEach((cookie) => {
    merged.set(cookie.name, cookie);
  });
  return [...merged.values()];
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

export function serializeCookieHeader(cookie: CookieToSet) {
  const sameSite =
    cookie.options?.sameSite === true
      ? 'Strict'
      : cookie.options?.sameSite === false
        ? 'None'
        : cookie.options?.sameSite
          ? `${cookie.options.sameSite.charAt(0).toUpperCase()}${cookie.options.sameSite.slice(1)}`
          : 'Lax';
  const parts = [
    `${cookie.name}=${cookie.value}`,
    `Path=${cookie.options?.path ?? '/'}`,
    `SameSite=${sameSite}`,
  ];
  if (cookie.options?.maxAge != null) {
    parts.push(`Max-Age=${cookie.options.maxAge}`);
  }
  if (cookie.options?.expires) {
    parts.push(`Expires=${cookie.options.expires.toUTCString()}`);
  }
  if (cookie.options?.domain) {
    parts.push(`Domain=${cookie.options.domain}`);
  }
  if (cookie.options?.httpOnly) {
    parts.push('HttpOnly');
  }
  if (cookie.options?.secure || sameSite === 'None') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function injectAuthCookiesOnResponse(
  response: {
    cookies: {
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
    };
    headers: { append: (name: string, value: string) => void };
  },
  cookiesToSet: CookieToSet[],
) {
  writeCookies(response.cookies, cookiesToSet);
  cookiesToSet.forEach((cookie) => {
    response.headers.append('Set-Cookie', serializeCookieHeader(cookie));
  });
}
