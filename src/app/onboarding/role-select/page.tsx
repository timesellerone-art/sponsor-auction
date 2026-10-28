'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { PageContainer } from '@/components/PageContainer';
import { RoleOnboarding } from '@/components/RoleOnboarding';
import {
  syncActiveRoleCookie,
  syncAuthPresentCookie,
  syncRoleCookie,
} from '@/lib/access';
import { postAuthPath } from '@/lib/auth-guard';
import { useSafetyTimeout } from '@/lib/auth-timeout';
import { isPlaceholderOAuthEmail } from '@/lib/contact';
import { resolveActiveMemberRole } from '@/types/auth';

function persistSessionCookies(user: {
  role?: string | null;
  roles?: unknown;
  currentMode?: unknown;
}) {
  syncRoleCookie(user.role ?? null, user.roles);
  syncAuthPresentCookie(true);
  syncActiveRoleCookie(resolveActiveMemberRole(user, user.currentMode));
}

export default function RoleSelectPage() {
  const router = useRouter();
  const { user, ready, needsOnboarding, refresh } = useAuth();
  const timedOut = useSafetyTimeout();
  const bootDone = ready || timedOut;

  useEffect(() => {
    if (!bootDone || !user || needsOnboarding) {
      return;
    }
    persistSessionCookies(user);
    const path = postAuthPath(user);
    router.replace(path);
    const hardNav = window.setTimeout(() => {
      if (window.location.pathname.startsWith('/onboarding')) {
        window.location.assign(path);
      }
    }, 800);
    return () => {
      window.clearTimeout(hardNav);
    };
  }, [bootDone, needsOnboarding, router, user]);

  if (!bootDone) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
        <span className="sr-only">로그인 정보를 확인하는 중</span>
      </div>
    );
  }

  if (user && !needsOnboarding) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
        <span className="sr-only">이동 중</span>
      </div>
    );
  }

  if (!user) {
    return (
      <PageContainer className="flex flex-1 flex-col items-center justify-center py-10 sm:py-16">
        <p className="text-base font-semibold text-zinc-950">로그인 정보를 확인하지 못했습니다.</p>
        <p className="mt-2 text-sm text-zinc-500">잠시 후 다시 시도하거나 로그인 화면으로 이동해 주세요.</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              void refresh();
            }}
            className="inline-flex h-10 items-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            다시 시도
          </button>
          <Link
            href="/login"
            className="inline-flex h-10 items-center rounded-full border border-zinc-200 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            로그인으로
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="flex flex-1 flex-col justify-center py-10 sm:py-16">
      <RoleOnboarding
        name={user.name || '회원'}
        email={user.email}
        needsContact={isPlaceholderOAuthEmail(user.email)}
        onCompleted={(roles) => {
          persistSessionCookies({ role: roles[0], roles });
          router.replace(postAuthPath(roles));
        }}
      />
    </PageContainer>
  );
}
