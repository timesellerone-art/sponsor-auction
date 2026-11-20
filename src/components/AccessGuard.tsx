'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON, syncRoleCookie } from '@/lib/access';
import { loginPath } from '@/lib/auth-guard';
import { isAuthLoggingOut } from '@/lib/auth-logout';
import { useSafetyTimeout } from '@/lib/auth-timeout';
import { hasAuthRole, parseAuthRoles, type AuthProfileRole } from '@/types/auth';

type AccessRole = 'admin' | 'advertiser' | 'creator' | 'signed-in';

type AccessGuardProps = {
  allow: AccessRole | readonly AccessRole[];
  children: ReactNode;
};

function allowedRoles(allow: AccessRole | readonly AccessRole[]) {
  return Array.isArray(allow) ? [...allow] : [allow];
}

function denialReason(
  allowed: AccessRole[],
  activeRole: 'advertiser' | 'creator' | null,
): 'admin-forbidden' | 'advertiser-forbidden' | 'creator-forbidden' {
  if (allowed.includes('admin') && allowed.length === 1) {
    return 'admin-forbidden';
  }
  if (activeRole === 'advertiser' || (allowed.includes('advertiser') && !allowed.includes('creator'))) {
    return 'advertiser-forbidden';
  }
  if (activeRole === 'creator' || (allowed.includes('creator') && !allowed.includes('advertiser'))) {
    return 'creator-forbidden';
  }
  return 'advertiser-forbidden';
}

export function AccessGuard({ allow, children }: AccessGuardProps) {
  const router = useRouter();
  const { user, ready, profileReady, activeRole } = useAuth();
  const timedOut = useSafetyTimeout();
  const roles = allowedRoles(allow);
  const roleRestricted = !roles.includes('signed-in');
  const settled = roleRestricted ? profileReady : ready || timedOut;
  const allowKey = roles.join('|');
  const hasAccess = Boolean(
    settled &&
      user &&
      (roles.includes('signed-in') ||
        (activeRole !== null && roles.includes(activeRole)) ||
        roles.some((role) => role !== 'signed-in' && hasAuthRole(user, role as AuthProfileRole))),
  );

  useEffect(() => {
    if (isAuthLoggingOut()) {
      return;
    }
    if (settled && parseAuthRoles(user?.roles, user?.role).length > 0) {
      syncRoleCookie(user?.role, user?.roles);
    }
    if (!settled || hasAccess) {
      return;
    }
    const allowed = allowKey.split('|') as AccessRole[];
    const wantsAdmin = allowed.includes('admin') && allowed.length === 1;
    if (!user) {
      const reason = wantsAdmin ? 'admin-auth' : 'advertiser-auth';
      showToast(ACCESS_REASON[reason]);
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(loginPath(reason, next));
      return;
    }

    const reason = denialReason(allowed, activeRole);
    showToast(ACCESS_REASON[reason]);
    router.replace(`/?reason=${reason}`);
  }, [activeRole, allowKey, hasAccess, router, settled, user]);

  if (isAuthLoggingOut()) {
    return (
      <div className="flex w-full flex-1 items-center justify-center px-4 py-16">
        <div className="h-40 w-full max-w-md animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  if (hasAccess) {
    return (
      <div className="flex w-full min-w-0 max-w-none flex-1 flex-col">{children}</div>
    );
  }

  return (
    <div className="flex w-full flex-1 items-center justify-center px-4 py-16">
      <div className="h-40 w-full max-w-md animate-pulse rounded-2xl bg-white" />
    </div>
  );
}
