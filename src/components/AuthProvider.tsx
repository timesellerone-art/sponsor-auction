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
  AUTH_PRESENT_COOKIE_NAME,
  readActiveRoleCookie,
  syncActiveRoleCookie,
  syncAuthPresentCookie,
  syncRoleCookie,
} from '@/lib/access';
import {
  isMemberRole,
  parseAuthRoles,
  resolveActiveMemberRole,
  switchableMemberRoles,
  type MemberRole,
  type SessionUser,
} from '@/types/auth';

type AuthContextValue = {
  user: SessionUser | null;
  ready: boolean;
  profileReady: boolean;
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
  profileReady: false,
  activeRole: null,
  switchableRoles: [],
  canCreateAuction: false,
  canPlaceBid: false,
  setActiveRole: () => false,
  refresh: async () => undefined,
});

function persistCurrentMode(role: MemberRole) {
  const supabase = createClient();
  if (!supabase) {
    return;
  }
  void supabase.auth.updateUser({ data: { current_mode: role } }).catch(() => null);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [roleOverride, setRoleOverride] = useState<MemberRole | null>(null);

  const latestRequest = useRef(0);

  const refresh = useCallback(async (mode: 'fast' | 'full' = 'full') => {
    const request = ++latestRequest.current;
    try {
      const result = await getSessionUser({
        profile: mode === 'full',
        verify: mode === 'full',
      });
      if (request !== latestRequest.current) {
        return;
      }
      applyKnownSession(result.data);
      if (mode === 'fast') {
        setReady(true);
        const hinted =
          typeof document !== 'undefined' &&
          document.cookie.split(';').some((part) => part.trim() === `${AUTH_PRESENT_COOKIE_NAME}=1`);
        if (result.data || hinted) {
          void refresh('full');
        } else {
          setProfileReady(true);
        }
      }
    } catch (error) {
      if (request !== latestRequest.current) {
        return;
      }
      console.warn('[SponsorAuction] 인증 상태를 갱신하지 못했습니다.', error);
      setUser(null);
      setRoleOverride(null);
      setProfileReady(true);
    } finally {
      if (request === latestRequest.current) {
        setReady(true);
        if (mode === 'full') {
          setProfileReady(true);
        }
      }
    }
  }, []);

  useEffect(() => {
    const failSafe = window.setTimeout(() => {
      setReady(true);
    }, AUTH_BOOT_TIMEOUT_MS);
    const profileFailSafe = window.setTimeout(() => {
      setProfileReady(true);
    }, AUTH_BOOT_TIMEOUT_MS * 3);
    const unsubKnown = onKnownSession((session) => {
      setUser(session);
      setReady(true);
      const cookieRole = session ? readActiveRoleCookie() : null;
      setRoleOverride(
        session && cookieRole && (!session.currentMode || cookieRole === session.currentMode)
          ? cookieRole
          : null,
      );
    });
    const unsubscribe = subscribeAuthState(() => {
      void refresh('full');
    });
    void refresh('fast');
    return () => {
      window.clearTimeout(failSafe);
      window.clearTimeout(profileFailSafe);
      unsubKnown();
      unsubscribe();
    };
  }, [refresh]);

  const switchableRoles = useMemo(() => switchableMemberRoles(user), [user]);
  const activeRole = user
    ? resolveActiveMemberRole(user, roleOverride ?? user.currentMode)
    : null;

  useEffect(() => {
    if (!ready || !profileReady) {
      return;
    }
    if (user && parseAuthRoles(user.roles, user.role).length === 0) {
      syncAuthPresentCookie(true);
      return;
    }
    syncRoleCookie(user?.role ?? null, user?.roles);
    syncAuthPresentCookie(Boolean(user));
    syncActiveRoleCookie(user ? activeRole : null);
  }, [activeRole, profileReady, ready, user]);

  const setActiveRole = useCallback(
    (role: MemberRole) => {
      if (!isMemberRole(role) || !switchableRoles.includes(role)) {
        return false;
      }
      setRoleOverride(role);
      syncActiveRoleCookie(role);
      persistCurrentMode(role);
      return true;
    },
    [switchableRoles],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      ready,
      profileReady,
      activeRole,
      switchableRoles,
      canCreateAuction: activeRole === 'advertiser',
      canPlaceBid: activeRole === 'creator',
      setActiveRole,
      refresh,
    }),
    [activeRole, profileReady, ready, refresh, setActiveRole, switchableRoles, user],
  );

  return (
    <AuthContext.Provider value={value}>
      <div className="flex min-h-screen w-full min-w-0 flex-1 flex-col">{children}</div>
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
