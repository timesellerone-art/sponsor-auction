'use client';

import { useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import type { AccessReason } from '@/lib/access';
import { authGuardMessage, loginPath } from '@/lib/auth-guard';
import { hasAuthRole } from '@/types/auth';

export function useRequireAuth() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready, canCreateAuction, canPlaceBid } = useAuth();

  const redirectToLogin = useCallback(
    (reason: AccessReason, nextPath?: string) => {
      showToast(authGuardMessage(reason));
      router.push(loginPath(reason, nextPath ?? pathname));
    },
    [pathname, router],
  );

  const requireUser = useCallback(
    (reason: AccessReason = 'auth-required', nextPath?: string) => {
      if (!ready) {
        return false;
      }
      if (!user) {
        redirectToLogin(reason, nextPath);
        return false;
      }
      return true;
    },
    [ready, redirectToLogin, user],
  );

  const requireCreator = useCallback(
    (nextPath?: string) => {
      if (!requireUser('creator-auth', nextPath)) {
        return false;
      }
      if (!canPlaceBid) {
        showToast(
          hasAuthRole(user, 'creator')
            ? '크리에이터 모드로 전환하면 입찰할 수 있습니다.'
            : authGuardMessage('creator-forbidden'),
        );
        return false;
      }
      return true;
    },
    [canPlaceBid, requireUser, user],
  );

  const requireAdvertiser = useCallback(
    (reason: AccessReason = 'advertiser-auth', nextPath?: string) => {
      if (!requireUser(reason, nextPath)) {
        return false;
      }
      if (!canCreateAuction) {
        showToast(
          hasAuthRole(user, 'advertiser')
            ? '광고주 모드로 전환하면 역경매를 등록할 수 있습니다.'
            : authGuardMessage('advertiser-forbidden'),
        );
        return false;
      }
      return true;
    },
    [canCreateAuction, requireUser, user],
  );

  return {
    user,
    ready,
    requireUser,
    requireCreator,
    requireAdvertiser,
    redirectToLogin,
  };
}
