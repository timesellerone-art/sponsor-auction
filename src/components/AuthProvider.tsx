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
import { RoleOnboarding } from '@/components/RoleOnboarding';
import { getSessionUser, subscribeAuthState } from '@/lib/auth';
import { syncRoleCookie } from '@/lib/access';
import {
  canCreateAuction,
  canPlaceBid,
  isAdmin,
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
    return subscribeAuthState(() => {
      void refresh();
    });
  }, [refresh]);

  const needsOnboarding = Boolean(user && !user.role && !isAdmin(user.role));
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
  }, [ready, user]);

  return (
    <AuthContext.Provider value={value}>
      <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col">
        {children}
        {needsOnboarding ? (
          <RoleOnboarding
            name={user?.name || '회원'}
            onCompleted={() => {
              void refresh();
            }}
          />
        ) : null}
      </div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
