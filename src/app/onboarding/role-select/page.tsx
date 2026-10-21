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

export default function RoleSelectPage() {
  const router = useRouter();
  const { user, ready, needsOnboarding, refresh } = useAuth();

  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    const settle = async () => {
      try {
        if (user) {
          if (!needsOnboarding) {
            router.replace(postAuthPath(user.role));
          }
          return;
        }

        const result = await getSessionUser();
        if (cancelled) {
          return;
        }
        if (result.data) {
          await refresh();
          if (!needsRoleOnboarding(result.data)) {
            router.replace(postAuthPath(result.data.role));
          }
          return;
        }
        router.replace(loginPath('auth-required', ROLE_SELECT_PATH));
      } catch {
        if (!cancelled) {
          router.replace(loginPath('auth-required', ROLE_SELECT_PATH));
        }
      }
    };

    void settle();
    return () => {
      cancelled = true;
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
        onCompleted={() => {
          void refresh().then(() => {
            router.replace('/my');
          });
        }}
      />
    </PageContainer>
  );
}
