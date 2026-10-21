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
import { getSessionUser, onKnownSession, subscribeAuthState } from '@/lib/auth';
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
    let settled = false;
    const failSafe = window.setTimeout(() => {
      if (!settled) {
        setReady(true);
      }
    }, 2500);
    try {
      const result = await getSessionUser();
      settled = true;
      setUser(result.data);
    } catch (error) {
      settled = true;
      console.warn('[SponsorAuction] 인증 상태를 갱신하지 못했습니다.', error);
      setUser(null);
    } finally {
      window.clearTimeout(failSafe);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const failSafe = window.setTimeout(() => {
      setReady(true);
    }, 4000);
    let skipRefreshUntil = 0;
    const unsubKnown = onKnownSession((session) => {
      skipRefreshUntil = Date.now() + 1500;
      setUser(session);
      setReady(true);
    });
    const unsubscribe = subscribeAuthState(() => {
      if (Date.now() < skipRefreshUntil) {
        return;
      }
      void refresh();
    });
    return () => {
      window.clearTimeout(failSafe);
      unsubKnown();
      unsubscribe();
    };
  }, [refresh]);

  const needsOnboarding = needsRoleOnboarding(user);
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      needsOnboarding,
      canCreateAuction: canCreateAuction(user),
      canPlaceBid: canPlaceBid(user),
      refresh,
    }),
    [needsOnboarding, ready, refresh, user],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }
    syncRoleCookie(user?.role ?? null, user?.roles);
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
