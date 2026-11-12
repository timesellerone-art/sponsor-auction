'use client';

import Link from 'next/link';
import { AccessGuard } from '@/components/AccessGuard';
import { AdvertiserDashboard } from '@/components/AdvertiserDashboard';
import { CreatorDashboard } from '@/components/CreatorDashboard';
import { MyWorkspaceNav } from '@/components/MyWorkspaceNav';
import { PageContainer } from '@/components/PageContainer';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';

export default function MyPage() {
  const { activeRole } = useAuth();
  const showCreator = activeRole === 'creator';
  const hasWorkspace = Boolean(activeRole);

  return (
    <AccessGuard allow="signed-in">
      <PageContainer className="w-full min-w-0 pt-6 sm:pt-10">
        <MyWorkspaceNav current="dashboard" />
      </PageContainer>
      {hasWorkspace ? (
        <>
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
        </>
      ) : (
        <PageContainer className="w-full min-w-0 pb-10">
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white px-5 py-8 sm:px-6">
            <h1 className="text-xl font-bold text-zinc-950">마이페이지</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              오픈 캠페인과 크리에이터는 바로 둘러볼 수 있습니다. 캠페인을 등록하거나 콘텐츠를
              제안할 때 필요한 정보를 입력하면 됩니다.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/my/settings"
                className="inline-flex h-10 items-center rounded-full bg-clink px-4 text-sm font-semibold text-white hover:bg-stone-800"
              >
                계정 설정
              </Link>
              <Link
                href="/#auctions"
                className="inline-flex h-10 items-center rounded-full border border-zinc-200 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                오픈 캠페인 보기
              </Link>
            </div>
          </div>
        </PageContainer>
      )}
    </AccessGuard>
  );
}
