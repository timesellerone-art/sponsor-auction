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
import { applyKnownSession, getSessionUser, onKnownSession, subscribeAuthState } from '@/lib/auth';
import { AUTH_BOOT_TIMEOUT_MS } from '@/lib/auth-timeout';
import { createClient } from '@/lib/supabase/client';
import {
  readActiveRoleCookie,
  syncActiveRoleCookie,
  syncAuthPresentCookie,
  syncRoleCookie,
} from '@/lib/access';
import {
  isMemberRole,
  needsRoleOnboarding,
  resolveActiveMemberRole,
  switchableMemberRoles,
  type MemberRole,
  type SessionUser,
} from '@/types/auth';

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  needsOnboarding: boolean;
  activeRole: MemberRole | null;
  switchableRoles: MemberRole[];
  canCreateAuction: boolean;
  canPlaceBid: boolean;
  setActiveRole: (role: MemberRole) => boolean;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  ready: false,
  needsOnboarding: false,
  activeRole: null,
  switchableRoles: [],
  canCreateAuction: false,
  canPlaceBid: false,
  setActiveRole: () => false,
  refresh: async () => undefined,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [activeRole, setActiveRoleState] = useState<MemberRole | null>(() =>
    readActiveRoleCookie(),
  );

  const refresh = useCallback(async () => {
    try {
      const result = await getSessionUser();
      applyKnownSession(result.data);
      setUser(result.data);
    } catch (error) {
      console.warn('[SponsorAuction] 인증 상태를 갱신하지 못했습니다.', error);
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void refresh();
    }, 0);
    const failSafe = window.setTimeout(() => {
      setReady(true);
    }, AUTH_BOOT_TIMEOUT_MS);
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
      window.clearTimeout(boot);
      window.clearTimeout(failSafe);
      unsubKnown();
      unsubscribe();
    };
  }, [refresh]);

  const switchableRoles = useMemo(() => switchableMemberRoles(user), [user]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    syncRoleCookie(user?.role ?? null, user?.roles);
    syncAuthPresentCookie(Boolean(user));
    const timer = window.setTimeout(() => {
      if (!user) {
        setActiveRoleState(null);
        syncActiveRoleCookie(null);
        return;
      }
      setActiveRoleState((current) =>
        resolveActiveMemberRole(
          user,
          current ?? readActiveRoleCookie() ?? user.currentMode,
        ),
      );
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [ready, user]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    syncActiveRoleCookie(user ? activeRole : null);
  }, [activeRole, ready, user]);

  const setActiveRole = useCallback(
    (role: MemberRole) => {
      if (!isMemberRole(role) || !switchableRoles.includes(role)) {
        return false;
      }
      setActiveRoleState(role);
      syncActiveRoleCookie(role);
      const supabase = createClient();
      void supabase?.auth
        .updateUser({ data: { current_mode: role } })
        .catch(() => null);
      return true;
    },
    [switchableRoles],
  );

  const needsOnboarding = needsRoleOnboarding(user);
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      needsOnboarding,
      activeRole,
      switchableRoles,
      canCreateAuction: activeRole === 'advertiser',
      canPlaceBid: activeRole === 'creator',
      setActiveRole,
      refresh,
    }),
    [activeRole, needsOnboarding, ready, refresh, setActiveRole, switchableRoles, user],
  );

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
