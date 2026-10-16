'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON, syncRoleCookie } from '@/lib/access';
import { loginPath } from '@/lib/auth-guard';

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
  const allowKey = allowedRoles(allow).join('|');

  useEffect(() => {
    if (!ready) {
      return;
    }

    syncRoleCookie(user?.role);
    const roles = allowKey.split('|').filter(Boolean) as AccessRole[];
    const ok = Boolean(user?.role && roles.includes(user.role as AccessRole));
    if (ok) {
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
  }, [allowKey, ready, router, user]);

  if (!ready || !allowed) {
    return (
      <div className="flex w-full flex-1 items-center justify-center px-4 py-16">
        <div className="h-40 w-full max-w-md animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  return children;
}
