import { ACCESS_REASON, type AccessReason } from '@/lib/access';
import { parseAuthRoles } from '@/types/auth';

export const ROLE_SELECT_PATH = '/onboarding/role-select';

export function sanitizeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  if (
    value.startsWith('/login') ||
    value.startsWith('/auth/callback') ||
    value.startsWith('/auth/oauth')
  ) {
    return null;
  }

  return value;
}

export const OAUTH_NEXT_COOKIE = 'sponsor-auction-oauth-next';
export const OAUTH_PROVIDER_COOKIE = 'sponsor-auction-oauth-provider';
export const OAUTH_RETRY_ERROR = 'oauth_retry';

/** 공급자가 Supabase 콜백을 중복 호출하면(카카오 2단계 인증 등) 두 번째 요청이 state를 찾지 못한다. */
export function isOAuthStateLost(code?: string | null, message?: string | null) {
  return (
    code === 'bad_oauth_state' ||
    /bad_oauth_state|oauth state not found|state.*expired/i.test(message ?? '')
  );
}

export function oauthRetryLoginPath() {
  return `/login?error=${OAUTH_RETRY_ERROR}`;
}

// Supabase Redirect URLs 허용 목록과 정확히 일치하도록 쿼리 없이 보낸다. next는 OAUTH_NEXT_COOKIE로 전달한다.
export function buildAppOAuthCallbackUrl(origin: string) {
  return `${origin.replace(/\/$/, '')}/auth/callback`;
}

export function oauthFailedLoginPath(reason?: string | null) {
  const params = new URLSearchParams();
  params.set('error', 'oauth_failed');
  const detail = reason?.trim();
  if (detail) {
    params.set('error_description', detail.slice(0, 300));
  }
  return `/login?${params.toString()}`;
}

export function describeOAuthError(raw?: string | null) {
  const text = raw?.trim() || '';
  if (/database error (saving|creating) new user/i.test(text)) {
    return '계정 생성 중 데이터베이스 오류가 발생했습니다. 동일 이메일의 기존 프로필과 충돌했을 수 있습니다.';
  }
  if (/code verifier|code_verifier|pkce/i.test(text)) {
    return '로그인 세션 검증값이 없습니다. 같은 브라우저에서 처음부터 다시 로그인해 주세요.';
  }
  if (isOAuthStateLost(null, text)) {
    return '소셜 로그인 확인이 중복 처리되었습니다. 다시 로그인해 주세요.';
  }
  if (/invalid.*(grant|code)|expired|flow state/i.test(text)) {
    return '로그인 코드가 만료되었거나 이미 사용되었습니다. 다시 로그인해 주세요.';
  }
  if (/access_denied|cancel/i.test(text)) {
    return '소셜 로그인이 취소되었습니다.';
  }
  return text || '소셜 로그인에 실패했습니다. 다시 시도해 주세요.';
}

export function loginPath(reason: AccessReason, nextPath?: string | null) {
  const params = new URLSearchParams();
  params.set('reason', reason);
  const next = sanitizeNextPath(nextPath);
  if (next) {
    params.set('next', next);
  }
  return `/login?${params.toString()}`;
}

export function authGuardMessage(reason: AccessReason) {
  return ACCESS_REASON[reason];
}

function canFollowNextPath(roles: ReturnType<typeof parseAuthRoles>, next: string) {
  if (next === ROLE_SELECT_PATH || next.startsWith('/onboarding')) {
    return false;
  }
  if (next === '/admin' || next.startsWith('/admin/')) {
    return roles.includes('admin');
  }
  if (next === '/my' || next.startsWith('/my/') || next.startsWith('/payments')) {
    return (
      roles.includes('advertiser') ||
      roles.includes('creator') ||
      roles.includes('admin')
    );
  }
  return true;
}

export function postAuthPath(role: unknown, nextPath?: string | null) {
  const next = sanitizeNextPath(nextPath);
  const roles = parseAuthRoles(role);
  if (roles.length === 0) {
    return ROLE_SELECT_PATH;
  }
  if (next && canFollowNextPath(roles, next)) {
    return next;
  }
  if (roles.includes('admin')) {
    return '/admin';
  }
  return '/my';
}

export function postSocialAuthPath(
  role: unknown,
  nextPath?: string | null,
  options?: { needsOnboarding?: boolean },
) {
  if (options?.needsOnboarding) {
    return ROLE_SELECT_PATH;
  }
  return postAuthPath(role, nextPath);
}
