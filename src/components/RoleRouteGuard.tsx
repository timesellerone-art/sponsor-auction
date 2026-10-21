'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { loginPath, ROLE_SELECT_PATH } from '@/lib/auth-guard';

const OPEN_WITHOUT_ROLE = [
  ROLE_SELECT_PATH,
  '/login',
  '/auth/callback',
  '/auth/oauth',
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

    if (!user && pathname.startsWith('/onboarding')) {
      router.replace(loginPath('auth-required', ROLE_SELECT_PATH));
      return;
    }

    if (user && needsOnboarding && !isOpenWithoutRole(pathname)) {
      router.replace(ROLE_SELECT_PATH);
      return;
    }

    if (user && !needsOnboarding && pathname.startsWith('/onboarding')) {
      router.replace(user.role === 'admin' ? '/admin' : '/my');
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
