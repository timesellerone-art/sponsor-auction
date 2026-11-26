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
import { useAuth } from '@/components/AuthProvider';
import type { LandingAudience } from '@/components/home/landing-audience';
import { isMemberRole } from '@/types/auth';

type LandingAudienceContextValue = {
  audience: LandingAudience;
  setAudience: (next: LandingAudience) => void;
};

const LandingAudienceContext = createContext<LandingAudienceContextValue | null>(null);

export function LandingAudienceProvider({ children }: { children: ReactNode }) {
  const { user, activeRole, switchableRoles, setActiveRole } = useAuth();
  const [audience, setLocalAudience] = useState<LandingAudience>(
    activeRole === 'creator' || activeRole === 'advertiser' ? activeRole : 'advertiser',
  );

  useEffect(() => {
    if (activeRole === 'advertiser' || activeRole === 'creator') {
      setLocalAudience(activeRole);
    }
  }, [activeRole]);

  const setAudience = useCallback(
    (next: LandingAudience) => {
      setLocalAudience(next);
      if (user && isMemberRole(next) && switchableRoles.includes(next)) {
        setActiveRole(next);
      }
    },
    [setActiveRole, switchableRoles, user],
  );

  const value = useMemo(() => ({ audience, setAudience }), [audience, setAudience]);

  return (
    <LandingAudienceContext.Provider value={value}>{children}</LandingAudienceContext.Provider>
  );
}

export function useLandingAudience() {
  const context = useContext(LandingAudienceContext);
  if (!context) {
    throw new Error('LandingAudienceProvider 안에서만 사용할 수 있습니다.');
  }
  return context;
}
