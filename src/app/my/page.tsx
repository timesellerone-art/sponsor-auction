'use client';

import { AccessGuard } from '@/components/AccessGuard';
import { AdvertiserDashboard } from '@/components/AdvertiserDashboard';
import { CreatorDashboard } from '@/components/CreatorDashboard';
import { useAuth } from '@/components/AuthProvider';

const DASHBOARD_ROLES = ['advertiser', 'creator'] as const;

export default function MyPage() {
  const { activeRole } = useAuth();

  return (
    <AccessGuard allow={DASHBOARD_ROLES}>
      {activeRole === 'creator' ? <CreatorDashboard /> : <AdvertiserDashboard />}
    </AccessGuard>
  );
}
