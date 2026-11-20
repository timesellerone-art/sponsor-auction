import {
  isMemberRole,
  parseAuthRoles,
  resolveActiveMemberRole,
  type MemberRole,
} from '@/types/auth';
import {
  authCookieDomain,
  clientCookieSuffix,
  isProductionClinkHost,
  PRODUCTION_COOKIE_DOMAIN,
} from '@/lib/site-origin';

export const ROLE_COOKIE_NAME = 'sponsor-auction-role';
export const ACTIVE_ROLE_COOKIE_NAME = 'sponsor-auction-active-role';
export const ACTIVE_ROLE_HEADER = 'x-clink-active-role';
export const AUTH_PRESENT_COOKIE_NAME = 'sponsor-auction-auth';

export const ACCESS_REASON = {
  'admin-auth': '관리자 페이지는 로그인이 필요합니다.',
  'admin-forbidden': '관리자만 접근할 수 있는 페이지입니다.',
  'advertiser-auth': '내 캠페인은 로그인이 필요합니다.',
  'advertiser-forbidden': '광고주 전용 페이지입니다.',
  'creator-auth': '제안은 로그인 후 크리에이터 계정으로 할 수 있습니다.',
  'creator-forbidden': '크리에이터 전용 기능입니다.',
  'auth-required': '이 기능을 사용하려면 로그인이 필요합니다.',
  'award-auth': '낙찰하려면 광고주 계정으로 로그인해 주세요.',
  'payment-auth': '결제는 로그인 후 이용할 수 있습니다.',
} as const;

export type AccessReason = keyof typeof ACCESS_REASON;

export function isAccessReason(value: string | null | undefined): value is AccessReason {
  return Boolean(value && value in ACCESS_REASON);
}

export function accessReasonMessage(reason: string | null | undefined) {
  if (!isAccessReason(reason)) {
    return null;
  }

  return ACCESS_REASON[reason];
}

export const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function roleCookieValue(...sources: unknown[]) {
  return parseAuthRoles(...sources).join(',');
}

type CookieWriter = {
  set: (
    name: string,
    value: string,
    options: { path: string; maxAge: number; sameSite: 'lax'; domain?: string },
  ) => void;
};

export function applyAuthCookies(
  store: CookieWriter,
  options: { present: boolean; roles?: unknown; activeRole?: unknown; hostname?: string | null },
) {
  const value = roleCookieValue(options.roles);
  const active = options.present
    ? resolveActiveMemberRole(options.roles, options.activeRole)
    : null;
  const domain = authCookieDomain(options.hostname);
  const base = {
    path: '/',
    sameSite: 'lax' as const,
    ...(domain ? { domain } : {}),
  };
  store.set(ROLE_COOKIE_NAME, value, {
    ...base,
    maxAge: value ? AUTH_COOKIE_MAX_AGE : 0,
  });
  store.set(ACTIVE_ROLE_COOKIE_NAME, active ?? '', {
    ...base,
    maxAge: active ? AUTH_COOKIE_MAX_AGE : 0,
  });
  store.set(AUTH_PRESENT_COOKIE_NAME, options.present ? '1' : '', {
    ...base,
    maxAge: options.present ? AUTH_COOKIE_MAX_AGE : 0,
  });
}

export function lastCookieValue(cookieHeader: string, name: string) {
  const prefix = `${name}=`;
  let value = '';
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      value = trimmed.slice(prefix.length);
    }
  }
  if (!value) {
    return '';
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function clientCookieValues(name: string) {
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix))
    .map((part) => part.slice(prefix.length));
}

function expireHostOnlyCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure`;
}

function readClientCookie(name: string) {
  if (typeof document === 'undefined') {
    return '';
  }
  const values = clientCookieValues(name);
  if (values.length > 1 && isProductionClinkHost(window.location.hostname)) {
    expireHostOnlyCookie(name);
    return clientCookieValues(name).at(-1) ?? '';
  }
  return values.at(-1) ?? '';
}

function writeClientCookie(name: string, value: string, maxAge: number) {
  expireHostOnlyCookie(name);
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Domain=${PRODUCTION_COOKIE_DOMAIN}`;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Secure; Domain=${PRODUCTION_COOKIE_DOMAIN}`;
  document.cookie = `${name}=${value}; Max-Age=${maxAge}${clientCookieSuffix()}`;
}

export function readActiveRoleCookie(): MemberRole | null {
  const value = readClientCookie(ACTIVE_ROLE_COOKIE_NAME);
  return isMemberRole(value) ? value : null;
}

export function syncActiveRoleCookie(role: MemberRole | null | undefined) {
  if (typeof document === 'undefined') {
    return;
  }
  const value = isMemberRole(role) ? role : '';
  writeClientCookie(ACTIVE_ROLE_COOKIE_NAME, value, value ? AUTH_COOKIE_MAX_AGE : 0);
}

export function syncRoleCookie(role: string | null | undefined, roles?: unknown) {
  if (typeof document === 'undefined') {
    return;
  }
  const value = roleCookieValue(roles, role);
  writeClientCookie(ROLE_COOKIE_NAME, value, value ? AUTH_COOKIE_MAX_AGE : 0);
}

export function syncAuthPresentCookie(present: boolean) {
  if (typeof document === 'undefined') {
    return;
  }
  writeClientCookie(AUTH_PRESENT_COOKIE_NAME, present ? '1' : '', present ? AUTH_COOKIE_MAX_AGE : 0);
}
