'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getSessionUser, subscribeAuthState } from '@/lib/auth';
import { syncAuthPresentCookie, syncRoleCookie } from '@/lib/access';
import {
  canCreateAuction,
  canPlaceBid,
  needsRoleOnboarding,
  type SessionUser,
} from '@/types/auth';

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  needsOnboarding: boolean;
  canCreateAuction: boolean;
  canPlaceBid: boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  ready: false,
  needsOnboarding: false,
  canCreateAuction: false,
  canPlaceBid: false,
  refresh: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await getSessionUser();
      setUser(result.data);
    } catch (error) {
      console.warn('[SponsorAuction] 인증 상태를 갱신하지 못했습니다.', error);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const failSafe = window.setTimeout(() => {
      setReady(true);
    }, 4000);
    const unsubscribe = subscribeAuthState(() => {
      void refresh();
    });
    return () => {
      window.clearTimeout(failSafe);
      unsubscribe();
    };
  }, [refresh]);

  const needsOnboarding = needsRoleOnboarding(user);
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      needsOnboarding,
      canCreateAuction: canCreateAuction(user?.role),
      canPlaceBid: canPlaceBid(user?.role),
      refresh,
    }),
    [needsOnboarding, ready, refresh, user],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }
    syncRoleCookie(user?.role ?? null);
    syncAuthPresentCookie(Boolean(user));
  }, [ready, user]);

  return (
    <AuthContext.Provider value={value}>
      <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col">
        {children}
      </div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
