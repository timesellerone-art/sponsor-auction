import {
  isMemberRole,
  parseAuthRoles,
  resolveActiveMemberRole,
  type MemberRole,
} from '@/types/auth';

export const ROLE_COOKIE_NAME = 'sponsor-auction-role';
export const ACTIVE_ROLE_COOKIE_NAME = 'sponsor-auction-active-role';
export const AUTH_PRESENT_COOKIE_NAME = 'sponsor-auction-auth';

export const ACCESS_REASON = {
  'admin-auth': '관리자 페이지는 로그인이 필요합니다.',
  'admin-forbidden': '관리자만 접근할 수 있는 페이지입니다.',
  'advertiser-auth': '내 역경매는 로그인이 필요합니다.',
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

const AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export function roleCookieValue(...sources: unknown[]) {
  return parseAuthRoles(...sources).join(',');
}

type CookieWriter = {
  set: (
    name: string,
    value: string,
    options: { path: string; maxAge: number; sameSite: 'lax' },
  ) => void;
};

export function applyAuthCookies(
  store: CookieWriter,
  options: { present: boolean; roles?: unknown; activeRole?: unknown },
) {
  const value = roleCookieValue(options.roles);
  const active = options.present
    ? resolveActiveMemberRole(options.roles, options.activeRole)
    : null;
  store.set(ROLE_COOKIE_NAME, value, {
    path: '/',
    maxAge: value ? AUTH_COOKIE_MAX_AGE : 0,
    sameSite: 'lax',
  });
  store.set(ACTIVE_ROLE_COOKIE_NAME, active ?? '', {
    path: '/',
    maxAge: active ? AUTH_COOKIE_MAX_AGE : 0,
    sameSite: 'lax',
  });
  store.set(AUTH_PRESENT_COOKIE_NAME, options.present ? '1' : '', {
    path: '/',
    maxAge: options.present ? AUTH_COOKIE_MAX_AGE : 0,
    sameSite: 'lax',
  });
}

export function readActiveRoleCookie(): MemberRole | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const raw = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${ACTIVE_ROLE_COOKIE_NAME}=`));
  const value = raw?.slice(`${ACTIVE_ROLE_COOKIE_NAME}=`.length) ?? '';
  return isMemberRole(value) ? value : null;
}

export function syncActiveRoleCookie(role: MemberRole | null | undefined) {
  if (typeof document === 'undefined') {
    return;
  }

  const value = isMemberRole(role) ? role : '';
  const maxAge = value ? AUTH_COOKIE_MAX_AGE : 0;
  document.cookie = `${ACTIVE_ROLE_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

export function syncRoleCookie(role: string | null | undefined, roles?: unknown) {
  if (typeof document === 'undefined') {
    return;
  }

  const value = roleCookieValue(roles, role);
  const maxAge = value ? AUTH_COOKIE_MAX_AGE : 0;
  document.cookie = `${ROLE_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  if (!value) {
    syncActiveRoleCookie(null);
  }
}

export function syncAuthPresentCookie(present: boolean) {
  if (typeof document === 'undefined') {
    return;
  }

  const maxAge = present ? 60 * 60 * 24 * 7 : 0;
  document.cookie = `${AUTH_PRESENT_COOKIE_NAME}=${present ? '1' : ''}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}
