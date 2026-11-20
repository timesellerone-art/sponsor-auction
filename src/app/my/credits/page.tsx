'use client';

import { AccessGuard } from '@/components/AccessGuard';
import { CreditWallet } from '@/components/CreditWallet';
import { MyWorkspaceNav } from '@/components/MyWorkspaceNav';
import { PageContainer } from '@/components/PageContainer';

export default function CreditWalletPage() {
  return (
    <AccessGuard allow={['advertiser', 'admin']}>
      <PageContainer className="w-full min-w-0 py-6 sm:py-10">
        <MyWorkspaceNav current="credits" />
        <p className="mt-6 text-sm font-semibold tracking-wide text-clink-accent">광고주</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">크레딧</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          보유 크레딧과 충전·이용 내역을 확인하고, 금액을 고른 뒤 토스페이먼츠로 충전합니다.
        </p>
        <CreditWallet />
      </PageContainer>
    </AccessGuard>
  );
}
