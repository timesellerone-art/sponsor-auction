'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON, syncRoleCookie } from '@/lib/access';
import { loginPath } from '@/lib/auth-guard';
import { hasAuthRole, type AuthProfileRole } from '@/types/auth';

type AccessRole = 'admin' | 'advertiser' | 'creator';

type AccessGuardProps = {
  allow: AccessRole | readonly AccessRole[];
  children: ReactNode;
};

function allowedRoles(allow: AccessRole | readonly AccessRole[]) {
  return Array.isArray(allow) ? [...allow] : [allow];
}

export function AccessGuard({ allow, children }: AccessGuardProps) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [allowed, setAllowed] = useState(false);
  const roles = allowedRoles(allow);
  const allowKey = roles.join('|');
  const hasAccess = Boolean(
    ready && user && roles.some((role) => hasAuthRole(user, role as AuthProfileRole)),
  );

  useEffect(() => {
    if (!ready) {
      return;
    }

    syncRoleCookie(user?.role, user?.roles);
    if (hasAccess) {
      setAllowed(true);
      return;
    }

    setAllowed(false);
    const wantsAdmin = roles.includes('admin') && roles.length === 1;
    if (!user) {
      const reason = wantsAdmin ? 'admin-auth' : 'advertiser-auth';
      showToast(ACCESS_REASON[reason]);
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(loginPath(reason, next));
      return;
    }

    const forbidden = wantsAdmin
      ? ACCESS_REASON['admin-forbidden']
      : roles.includes('advertiser') && !roles.includes('creator')
        ? ACCESS_REASON['advertiser-forbidden']
        : ACCESS_REASON['creator-forbidden'];
    showToast(forbidden);
    router.replace(
      `/?reason=${wantsAdmin ? 'admin-forbidden' : roles.includes('advertiser') && !roles.includes('creator') ? 'advertiser-forbidden' : 'creator-forbidden'}`,
    );
  }, [allowKey, hasAccess, ready, router, user]);

  if (hasAccess || allowed) {
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
