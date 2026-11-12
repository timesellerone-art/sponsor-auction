'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { syncActiveRoleCookie, syncAuthPresentCookie, syncRoleCookie } from '@/lib/access';
import { POST_AUTH_HOME } from '@/lib/auth-guard';
import { isAuthLoggingOut } from '@/lib/auth-logout';
import { resolveActiveMemberRole } from '@/types/auth';

function RoleRouteGuardInner({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useAuth();

  useEffect(() => {
    if (!ready || isAuthLoggingOut()) {
      return;
    }

    if (user) {
      syncRoleCookie(user.role, user.roles);
      syncAuthPresentCookie(true);
      syncActiveRoleCookie(resolveActiveMemberRole(user, user.currentMode));
    }

    if (pathname.startsWith('/onboarding') || pathname === '/select-role') {
      router.replace(POST_AUTH_HOME);
    }
  }, [pathname, ready, router, user]);

  return children;
}

export function RoleRouteGuard({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <RoleRouteGuardInner>{children}</RoleRouteGuardInner>
    </Suspense>
  );
}
