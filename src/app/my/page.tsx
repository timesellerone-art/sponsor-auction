'use client';

import { AccessGuard } from '@/components/AccessGuard';
import { AdvertiserDashboard } from '@/components/AdvertiserDashboard';
import { CreatorDashboard } from '@/components/CreatorDashboard';
import { MyWorkspaceNav } from '@/components/MyWorkspaceNav';
import { PageContainer } from '@/components/PageContainer';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';

const DASHBOARD_ROLES = ['advertiser', 'creator'] as const;

export default function MyPage() {
  const { activeRole } = useAuth();
  const showCreator = activeRole === 'creator';

  return (
    <AccessGuard allow={DASHBOARD_ROLES}>
      <PageContainer className="w-full min-w-0 pt-6 sm:pt-10">
        <MyWorkspaceNav current="dashboard" />
      </PageContainer>
      <div
        className={cn('flex min-h-0 w-full min-w-0 flex-1 flex-col', showCreator && 'hidden')}
        aria-hidden={showCreator}
        inert={showCreator}
      >
        <AdvertiserDashboard />
      </div>
      <div
        className={cn('flex min-h-0 w-full min-w-0 flex-1 flex-col', !showCreator && 'hidden')}
        aria-hidden={!showCreator}
        inert={!showCreator}
      >
        <CreatorDashboard />
      </div>
    </AccessGuard>
  );
}
