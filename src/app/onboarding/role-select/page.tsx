'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { PageContainer } from '@/components/PageContainer';
import { RoleOnboarding } from '@/components/RoleOnboarding';
import { syncAuthPresentCookie } from '@/lib/access';
import { postAuthPath } from '@/lib/auth-guard';
import { isPlaceholderOAuthEmail } from '@/lib/contact';

export default function RoleSelectPage() {
  const router = useRouter();
  const { user, ready, needsOnboarding } = useAuth();

  useEffect(() => {
    if (!ready || !user || needsOnboarding) {
      return;
    }
    router.replace(postAuthPath(user));
  }, [needsOnboarding, ready, router, user]);

  useEffect(() => {
    if (!ready || user) {
      return;
    }
    const timer = window.setTimeout(() => {
      syncAuthPresentCookie(false);
      router.replace('/login');
    }, 50);
    return () => {
      window.clearTimeout(timer);
    };
  }, [ready, router, user]);

  if (!ready || (user && !needsOnboarding)) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
        <span className="sr-only">{user ? '이동 중' : '로그인 정보를 확인하는 중'}</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
        <span className="sr-only">로그인 정보를 확인하는 중</span>
      </div>
    );
  }

  return (
    <PageContainer className="flex flex-1 flex-col justify-center py-10 sm:py-16">
      <RoleOnboarding
        name={user.name || '회원'}
        email={user.email}
        needsContact={isPlaceholderOAuthEmail(user.email)}
        onCompleted={(roles) => {
          router.replace(postAuthPath(roles));
        }}
      />
    </PageContainer>
  );
}
