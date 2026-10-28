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

export function buildAppOAuthCallbackUrl(origin: string, nextPath?: string | null) {
  const base = origin.replace(/\/$/, '');
  const next = sanitizeNextPath(nextPath) ?? ROLE_SELECT_PATH;
  return `${base}/auth/callback?next=${encodeURIComponent(next)}`;
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
