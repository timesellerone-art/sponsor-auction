'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  LANDING_AUDIENCE_CHANGED_EVENT,
  readLandingAudience,
} from '@/components/home/landing-audience';
import type { MemberRole } from '@/types/auth';

export function useActingMemberRole(): MemberRole | null {
  const { user, ready, activeRole } = useAuth();
  const [guestRole, setGuestRole] = useState<MemberRole>('advertiser');

  useEffect(() => {
    const sync = () => {
      setGuestRole(readLandingAudience());
    };
    sync();
    window.addEventListener(LANDING_AUDIENCE_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(LANDING_AUDIENCE_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  if (!ready) {
    return null;
  }
  if (user) {
    return activeRole;
  }
  return guestRole;
}
