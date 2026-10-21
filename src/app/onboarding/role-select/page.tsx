'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { PageContainer } from '@/components/PageContainer';
import { RoleOnboarding } from '@/components/RoleOnboarding';
import { AUTH_PRESENT_COOKIE_NAME, syncAuthPresentCookie, syncRoleCookie } from '@/lib/access';
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

function hasAuthPresentCookie() {
  if (typeof document === 'undefined') {
    return false;
  }
  return document.cookie.split(';').some((part) => part.trim() === `${AUTH_PRESENT_COOKIE_NAME}=1`);
}

export default function RoleSelectPage() {
  const router = useRouter();
  const { user, ready, needsOnboarding, refresh } = useAuth();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTimedOut(true);
    }, 1500);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (user && !needsOnboarding) {
      const path = postAuthPath(user);
      router.replace(path);
      goDashboard(path);
    }
  }, [needsOnboarding, router, user]);

  useEffect(() => {
    if (user && needsOnboarding) {
      return;
    }
    if (user && !needsOnboarding) {
      return;
    }

    let cancelled = false;

    const settle = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await getSessionUser();
          if (cancelled) {
            return;
          }
          if (result.data) {
            if (!needsRoleOnboarding(result.data)) {
              const path = postAuthPath(result.data);
              router.replace(path);
              goDashboard(path);
              return;
            }
            await refresh();
            return;
          }
          if (hasAuthPresentCookie() || timedOut) {
            return;
          }
          syncAuthPresentCookie(false);
          syncRoleCookie(null);
          router.replace(loginPath('auth-required', ROLE_SELECT_PATH));
        } catch {
          if (!cancelled && timedOut && !hasAuthPresentCookie()) {
            syncAuthPresentCookie(false);
            syncRoleCookie(null);
            router.replace(loginPath('auth-required', ROLE_SELECT_PATH));
          }
        }
      })();
    }, ready ? 200 : 400);

    return () => {
      cancelled = true;
      window.clearTimeout(settle);
    };
  }, [needsOnboarding, ready, refresh, router, timedOut, user]);

  useEffect(() => {
    if (!timedOut || user) {
      return;
    }
    if (hasAuthPresentCookie()) {
      return;
    }
    syncAuthPresentCookie(false);
    syncRoleCookie(null);
    router.replace(loginPath('auth-required', ROLE_SELECT_PATH));
  }, [router, timedOut, user]);

  if (user && !needsOnboarding) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
        <span className="sr-only">이동 중</span>
      </div>
    );
  }

  const showForm = Boolean(user && needsOnboarding) || timedOut;

  if (!showForm) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
        <span className="sr-only">역할을 불러오는 중</span>
      </div>
    );
  }

  return (
    <PageContainer className="flex flex-1 flex-col justify-center py-10 sm:py-16">
      <RoleOnboarding
        name={user?.name || '회원'}
        onCompleted={(roles) => {
          const path = postAuthPath(roles);
          router.replace(path);
          goDashboard(path);
        }}
      />
    </PageContainer>
  );
}
