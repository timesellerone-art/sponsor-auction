'use client';

import { Suspense, useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { readActiveRoleCookie, syncActiveRoleCookie, syncAuthPresentCookie, syncRoleCookie } from '@/lib/access';
import { POST_AUTH_HOME } from '@/lib/auth-guard';
import { isAuthLoggingOut } from '@/lib/auth-logout';
import { PHONE_ONBOARDING_PATH, needsPhoneOnboarding } from '@/lib/phone-signup';
import { resolveActiveMemberRole } from '@/types/auth';

function RoleRouteEffects() {
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
      syncActiveRoleCookie(
        resolveActiveMemberRole(user, readActiveRoleCookie() ?? user.currentMode),
      );
    }

    if (needsPhoneOnboarding(user)) {
      if (!pathname.startsWith(PHONE_ONBOARDING_PATH)) {
        router.replace(PHONE_ONBOARDING_PATH);
      }
      return;
    }

    if (pathname.startsWith('/onboarding') || pathname === '/select-role') {
      if (!user) {
        router.replace('/login');
        return;
      }
      router.replace(POST_AUTH_HOME);
    }
  }, [pathname, ready, router, user]);

  return null;
}

export function RoleRouteGuard({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <RoleRouteEffects />
      </Suspense>
      {children}
    </>
  );
}
