export const MEMBER_ROLES = ['advertiser', 'creator'] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export type AuthProfileRole = MemberRole | 'admin';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: AuthProfileRole | null;
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
