'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { syncActiveRoleCookie, syncAuthPresentCookie, syncRoleCookie } from '@/lib/access';
import { ROLE_SELECT_PATH } from '@/lib/auth-guard';
import { resolveActiveMemberRole } from '@/types/auth';

const OPEN_WITHOUT_ROLE = [
  ROLE_SELECT_PATH,
  '/onboarding',
  '/select-role',
  '/login',
  '/auth',
  '/privacy',
  '/terms',
  '/refund',
];

function isOpenWithoutRole(pathname: string) {
  return OPEN_WITHOUT_ROLE.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function RoleRouteGuardInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, needsOnboarding } = useAuth();

  useEffect(() => {
    if (!ready) {
      return;
    }

    if (user && needsOnboarding && !isOpenWithoutRole(pathname)) {
      router.replace(ROLE_SELECT_PATH);
      return;
    }

    if (user && !needsOnboarding && pathname.startsWith('/onboarding')) {
      syncRoleCookie(user.role, user.roles);
      syncAuthPresentCookie(true);
      syncActiveRoleCookie(resolveActiveMemberRole(user, user.currentMode));
      router.replace(user.role === 'admin' || user.roles?.includes('admin') ? '/admin' : '/my');
    }
  }, [needsOnboarding, pathname, ready, router, user]);

  return children;
}

export function RoleRouteGuard({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <RoleRouteGuardInner>{children}</RoleRouteGuardInner>
    </Suspense>
  );
}
