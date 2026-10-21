'use client';

import { AccessGuard } from '@/components/AccessGuard';
import { AdvertiserDashboard } from '@/components/AdvertiserDashboard';
import { CreatorDashboard } from '@/components/CreatorDashboard';
import { useAuth } from '@/components/AuthProvider';
import { isCreator, isAdvertiser } from '@/types/auth';

const DASHBOARD_ROLES = ['advertiser', 'creator'] as const;

export default function MyPage() {
  const { user } = useAuth();

  return (
    <AccessGuard allow={DASHBOARD_ROLES}>
      {isCreator(user) && !isAdvertiser(user) ? (
        <CreatorDashboard />
      ) : (
        <AdvertiserDashboard />
      )}
    </AccessGuard>
  );
}
