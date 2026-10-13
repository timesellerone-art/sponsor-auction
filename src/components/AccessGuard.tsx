'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON, syncRoleCookie } from '@/lib/access';
import { loginPath } from '@/lib/auth-guard';

type AccessRole = 'admin' | 'advertiser' | 'creator';

type AccessGuardProps = {
  allow: AccessRole;
  children: ReactNode;
};

function matchesRole(allow: AccessRole, role: string | null | undefined) {
  return role === allow;
}

export function AccessGuard({ allow, children }: AccessGuardProps) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }

    syncRoleCookie(user?.role);
    const ok = matchesRole(allow, user?.role);
    if (ok) {
      setAllowed(true);
      return;
    }

    setAllowed(false);
    if (!user) {
      const reason = allow === 'admin' ? 'admin-auth' : 'advertiser-auth';
      showToast(ACCESS_REASON[reason]);
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(loginPath(reason, next));
      return;
    }

    const forbidden =
      allow === 'admin'
        ? ACCESS_REASON['admin-forbidden']
        : allow === 'advertiser'
          ? ACCESS_REASON['advertiser-forbidden']
          : ACCESS_REASON['creator-forbidden'];
    showToast(forbidden);
    router.replace(
      `/?reason=${allow === 'admin' ? 'admin-forbidden' : allow === 'advertiser' ? 'advertiser-forbidden' : 'creator-forbidden'}`,
    );
  }, [allow, ready, router, user]);

  if (!ready || !allowed) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-1 items-center justify-center px-4 py-16">
        <div className="h-40 w-full max-w-md animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  return children;
}
