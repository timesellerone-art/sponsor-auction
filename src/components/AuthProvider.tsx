'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  MEMBER_ROLES,
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

  const latestRequest = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const result = await getSessionUser();
      if (request !== latestRequest.current) {
        return;
      }
      applyKnownSession(result.data);
    } catch (error) {
      if (request !== latestRequest.current) {
        return;
      }
      console.warn('[SponsorAuction] 인증 상태를 갱신하지 못했습니다.', error);
      setUser(null);
    } finally {
      if (request === latestRequest.current) {
        setReady(true);
      }
    }
  }, []);

  useEffect(() => {
    const boot = window.setTimeout(() => {
      void refresh();
    }, 0);
    const failSafe = window.setTimeout(() => {
      setReady(true);
    }, AUTH_BOOT_TIMEOUT_MS);
    const unsubKnown = onKnownSession((session) => {
      setUser(session);
      setReady(true);
    });
    const unsubscribe = subscribeAuthState(() => {
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
        .updateUser({ data: { current_mode: role, roles: [...MEMBER_ROLES] } })
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
