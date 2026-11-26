'use client';

import { AccessGuard } from '@/components/AccessGuard';
import { BusinessRegistrationForm } from '@/components/BusinessRegistrationForm';
import { LinkedAccountsPanel } from '@/components/LinkedAccountsPanel';
import { MyWorkspaceNav } from '@/components/MyWorkspaceNav';
import { PageContainer } from '@/components/PageContainer';
import { SettlementAccountForm } from '@/components/SettlementAccountForm';
import { useAuth } from '@/components/AuthProvider';

export default function AccountSettingsPage() {
  const { activeRole } = useAuth();

  return (
    <AccessGuard allow="signed-in">
      <PageContainer className="flex min-w-0 flex-1 flex-col py-6 sm:py-10">
        <MyWorkspaceNav current="settings" />
        <p className="mt-6 text-sm font-semibold tracking-wide text-clink-accent">계정</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">계정 설정</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-500">
          소셜 계정 연동과 휴대전화를 관리할 수 있습니다. 이메일이 다른 Google·Kakao·Naver도 현재
          계정에 합칠 수 있습니다.
        </p>
        <LinkedAccountsPanel />
        {activeRole === 'creator' ? <SettlementAccountForm /> : null}
        {activeRole === 'advertiser' || activeRole === 'creator' ? (
          <BusinessRegistrationForm />
        ) : null}
      </PageContainer>
    </AccessGuard>
  );
}
