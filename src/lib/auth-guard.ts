import { ACCESS_REASON, type AccessReason } from '@/lib/access';
import { isAuthProfileRole } from '@/types/auth';

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

export function postAuthPath(role: string | null | undefined, nextPath?: string | null) {
  const next = sanitizeNextPath(nextPath);
  if (!isAuthProfileRole(role)) {
    return ROLE_SELECT_PATH;
  }
  if (next && next !== ROLE_SELECT_PATH && !next.startsWith('/onboarding')) {
    return next;
  }
  if (role === 'admin') {
    return '/admin';
  }
  return '/my';
}
