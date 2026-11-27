'use client';

import { AccessGuard } from '@/components/AccessGuard';
import { useAuth } from '@/components/AuthProvider';
import { CreditWallet } from '@/components/CreditWallet';
import { MyWorkspaceNav } from '@/components/MyWorkspaceNav';
import { PageContainer } from '@/components/PageContainer';

export default function CreditWalletPage() {
  const { activeRole } = useAuth();

  return (
    <AccessGuard allow="signed-in">
      <PageContainer className="w-full min-w-0 py-6 sm:py-10">
        <MyWorkspaceNav current="credits" />
        <p className="mt-6 text-sm font-semibold tracking-wide text-clink-accent">
          {activeRole === 'creator' ? '크리에이터' : '광고주'}
        </p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">원장 내역</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          캠페인 결제·정산 원장을 확인합니다. 결제는 토스페이먼츠 단건 에스크로로 진행하며, 선불
          충전은 제공하지 않습니다.
        </p>
        <CreditWallet canCharge={false} />
      </PageContainer>
    </AccessGuard>
  );
}
