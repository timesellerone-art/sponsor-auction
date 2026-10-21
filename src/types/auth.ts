export const MEMBER_ROLES = ['advertiser', 'creator'] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export type AuthProfileRole = MemberRole | 'admin';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: AuthProfileRole | null;
  createdAt?: string;
  lastSignInAt?: string | null;
  onboardingComplete?: boolean;
}

export function isMemberRole(value: unknown): value is MemberRole {
  return value === 'advertiser' || value === 'creator';
}

export function isAuthProfileRole(value: unknown): value is AuthProfileRole {
  return isMemberRole(value) || value === 'admin';
}

export function isAdmin(role: string | null | undefined): boolean {
  return role === 'admin';
}

export function isAdvertiser(role: string | null | undefined): boolean {
  return role === 'advertiser';
}

export function isCreator(role: string | null | undefined): boolean {
  return role === 'creator';
}

const FIRST_SIGNIN_WINDOW_MS = 15 * 60 * 1000;

export function isFirstAuthSignIn(user: {
  createdAt?: string | null;
  lastSignInAt?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
} | null | undefined) {
  const createdRaw = user?.createdAt || user?.created_at;
  if (!createdRaw) {
    return false;
  }
  const created = Date.parse(createdRaw);
  const last = Date.parse(user?.lastSignInAt || user?.last_sign_in_at || createdRaw);
  if (!Number.isFinite(created) || !Number.isFinite(last)) {
    return false;
  }
  return Math.abs(last - created) < FIRST_SIGNIN_WINDOW_MS;
}

export function needsRoleOnboarding(user: SessionUser | null | undefined): boolean {
  if (!user) {
    return false;
  }
  if (user.role === 'admin') {
    return false;
  }
  if (user.onboardingComplete && isAuthProfileRole(user.role)) {
    return false;
  }
  if (!isAuthProfileRole(user.role)) {
    return true;
  }
  return isFirstAuthSignIn(user);
}

export function canCreateAuction(role: string | null | undefined): boolean {
  return isAdvertiser(role);
}

export function canPlaceBid(role: string | null | undefined): boolean {
  return isCreator(role);
}

export function memberRoleLabel(role: AuthProfileRole | null | undefined): string {
  if (role === 'advertiser') {
    return '광고주';
  }
  if (role === 'creator') {
    return '크리에이터';
  }
  if (role === 'admin') {
    return '관리자';
  }
  return '역할 미설정';
}
