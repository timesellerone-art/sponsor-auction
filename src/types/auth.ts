export const MEMBER_ROLES = ['advertiser', 'creator'] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];

export type AuthProfileRole = MemberRole | 'admin';

export type ProofProvider = 'google' | 'kakao' | 'naver' | 'email';

export type AccountMergeChallenge = {
  maskedEmail: string;
  providers: ProofProvider[];
};

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: AuthProfileRole | null;
  roles?: AuthProfileRole[];
  createdAt?: string;
  lastSignInAt?: string | null;
  onboardingComplete?: boolean;
  currentMode?: MemberRole | null;
}

export function isMemberRole(value: unknown): value is MemberRole {
  return value === 'advertiser' || value === 'creator';
}

export function memberRolesFromInput(role?: unknown, roles?: unknown): MemberRole[] {
  return parseAuthRoles(roles, role).filter(isMemberRole);
}

export function isAuthProfileRole(value: unknown): value is AuthProfileRole {
  return isMemberRole(value) || value === 'admin';
}

export function parseAuthRoles(...sources: unknown[]): AuthProfileRole[] {
  const found: AuthProfileRole[] = [];
  const seen = new Set<AuthProfileRole>();

  const push = (value: unknown) => {
    if (isAuthProfileRole(value) && !seen.has(value)) {
      seen.add(value);
      found.push(value);
    }
  };

  for (const source of sources) {
    if (!source) {
      continue;
    }
    if (typeof source === 'string') {
      for (const part of source.split(/[,\s]+/)) {
        push(part.trim());
      }
      continue;
    }
    if (Array.isArray(source)) {
      source.forEach(push);
      continue;
    }
    if (typeof source === 'object') {
      const holder = source as { role?: unknown; roles?: unknown };
      if (Array.isArray(holder.roles) || typeof holder.roles === 'string') {
        parseAuthRoles(holder.roles).forEach(push);
      }
      push(holder.role);
    }
  }

  return found;
}

export function primaryAuthRole(...sources: unknown[]): AuthProfileRole | null {
  const roles = parseAuthRoles(...sources);
  if (roles.includes('admin')) {
    return 'admin';
  }
  return roles[0] ?? null;
}

export function hasAuthRole(source: unknown, role: AuthProfileRole): boolean {
  return parseAuthRoles(source).includes(role);
}

export function isAdmin(source: unknown): boolean {
  return hasAuthRole(source, 'admin');
}

export function isAdvertiser(source: unknown): boolean {
  return hasAuthRole(source, 'advertiser');
}

export function isCreator(source: unknown): boolean {
  return hasAuthRole(source, 'creator');
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
  const roles = parseAuthRoles(user);
  if (roles.includes('admin') || roles.some(isMemberRole)) {
    return false;
  }
  return true;
}

export function switchableMemberRoles(source: unknown): MemberRole[] {
  const owned = parseAuthRoles(source).filter(isMemberRole);
  if (owned.length === 0) {
    return [];
  }
  return [...MEMBER_ROLES];
}

export function resolveActiveMemberRole(
  owned: unknown,
  preferred?: unknown,
): MemberRole | null {
  const ownedRoles = switchableMemberRoles(owned);
  if (isMemberRole(preferred) && ownedRoles.includes(preferred)) {
    return preferred;
  }
  return ownedRoles[0] ?? null;
}

export function canCreateAuction(source: unknown): boolean {
  return isAdvertiser(source);
}

export function canPlaceBid(source: unknown): boolean {
  return isCreator(source);
}

export function memberModeLabel(role: MemberRole | null | undefined): string {
  if (role === 'creator') {
    return '크리에이터 모드';
  }
  if (role === 'advertiser') {
    return '광고주 모드';
  }
  return '역할 미설정';
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

export function memberRolesLabel(source: unknown): string {
  const roles = parseAuthRoles(source);
  if (roles.length === 0) {
    return '역할 미설정';
  }
  return roles.map((role) => memberRoleLabel(role)).join(' · ');
}
