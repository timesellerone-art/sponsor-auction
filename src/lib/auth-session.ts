import {
  isMemberRole,
  parseAuthRoles,
  primaryAuthRole,
  type SessionUser,
} from '@/types/auth';

export function sessionUserFromAuthUser(user: {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  last_sign_in_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): SessionUser {
  const meta = user.user_metadata ?? {};
  const roles = parseAuthRoles(meta.roles, meta.role);
  const email = user.email?.includes('@')
    ? user.email
    : `user.${user.id.replace(/-/g, '').slice(0, 12)}@oauth.sponsor-auction.local`;
  const metaName = typeof meta.name === 'string' ? meta.name.trim() : '';
  const metaPhone = typeof meta.phone === 'string' ? meta.phone.trim() : '';
  return {
    id: user.id,
    email,
    name: metaName || email.split('@')[0] || '회원',
    phone: metaPhone || user.phone?.trim() || null,
    role: primaryAuthRole(roles),
    roles,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at,
    onboardingComplete: meta.onboarding_complete === true,
    currentMode: isMemberRole(meta.current_mode) ? meta.current_mode : null,
  };
}

export function sessionUserWithProfileRoles(
  user: Parameters<typeof sessionUserFromAuthUser>[0],
  profile?: { role?: unknown; roles?: unknown; phone?: unknown } | null,
): SessionUser {
  const base = sessionUserFromAuthUser(user);
  const roles = parseAuthRoles(profile?.roles, profile?.role, base.roles, base.role);
  const profilePhone = typeof profile?.phone === 'string' ? profile.phone.trim() : '';
  return {
    ...base,
    phone: profilePhone || base.phone,
    role: primaryAuthRole(roles),
    roles,
    onboardingComplete: base.onboardingComplete || roles.length > 0,
  };
}
