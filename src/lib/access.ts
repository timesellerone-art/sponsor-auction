export const ROLE_COOKIE_NAME = 'sponsor-auction-role';

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

export function syncRoleCookie(role: string | null | undefined) {
  if (typeof document === 'undefined') {
    return;
  }

  const value =
    role === 'admin' || role === 'advertiser' || role === 'creator' ? role : '';
  const maxAge = value ? 60 * 60 * 24 * 7 : 0;
  document.cookie = `${ROLE_COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}
