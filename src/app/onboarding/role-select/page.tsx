'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { PageContainer } from '@/components/PageContainer';
import { RoleOnboarding } from '@/components/RoleOnboarding';
import { getSessionUser } from '@/lib/auth';
import { loginPath, postAuthPath, ROLE_SELECT_PATH } from '@/lib/auth-guard';
import { needsRoleOnboarding } from '@/types/auth';

function goDashboard(path: string) {
  if (typeof window === 'undefined') {
    return;
  }
  window.setTimeout(() => {
    if (window.location.pathname.startsWith('/onboarding')) {
      window.location.assign(path);
    }
  }, 1500);
}

export default function RoleSelectPage() {
  const router = useRouter();
  const { user, ready, needsOnboarding, refresh } = useAuth();

  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    if (user && !needsOnboarding) {
      const path = postAuthPath(user.role);
      router.replace(path);
      goDashboard(path);
      return;
    }

    if (user && needsOnboarding) {
      return;
    }

    const settle = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await getSessionUser();
          if (cancelled) {
            return;
          }
          if (result.data) {
            if (!needsRoleOnboarding(result.data)) {
              const path = postAuthPath(result.data.role);
              router.replace(path);
              goDashboard(path);
              return;
            }
            await refresh();
            return;
          }
          router.replace(loginPath('auth-required', ROLE_SELECT_PATH));
        } catch {
          if (!cancelled) {
            router.replace(loginPath('auth-required', ROLE_SELECT_PATH));
          }
        }
      })();
    }, 250);

    const failSafe = window.setTimeout(() => {
      if (!cancelled && !user) {
        router.replace(loginPath('auth-required', ROLE_SELECT_PATH));
      }
    }, 4000);

    return () => {
      cancelled = true;
      window.clearTimeout(settle);
      window.clearTimeout(failSafe);
    };
  }, [needsOnboarding, ready, refresh, router, user]);

  if (!ready || !user || !needsOnboarding) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
      </div>
    );
  }

  return (
    <PageContainer className="flex flex-1 flex-col justify-center py-10 sm:py-16">
      <RoleOnboarding
        name={user.name || '회원'}
        onCompleted={(role) => {
          const path = postAuthPath(role);
          router.replace(path);
          goDashboard(path);
        }}
      />
    </PageContainer>
  );
}
