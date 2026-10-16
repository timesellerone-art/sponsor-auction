import { ACCESS_REASON, type AccessReason } from '@/lib/access';

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
