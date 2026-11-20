'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AccessGuard } from '@/components/AccessGuard';
import { authRequestInit } from '@/lib/auth-request';
import { PageContainer } from '@/components/PageContainer';
import { formatWon } from '@/lib/utils';

function CreditChargeFail() {
  const params = useSearchParams();
  const started = useRef(false);
  const [balance, setBalance] = useState<number | null>(null);
  const message = params.get('message')?.trim() || '결제가 취소되었거나 승인되지 않았습니다.';

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const orderId = params.get('orderId')?.trim() ?? '';
    if (!orderId) {
      return;
    }
    void authRequestInit({
      method: 'POST',
      body: JSON.stringify({ orderId }),
    })
      .then((init) => fetch('/api/credits/charge/fail', init))
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as { balance?: number | null } | null;
        if (typeof body?.balance === 'number') {
          setBalance(body.balance);
        }
      })
      .catch(() => {
        setBalance(null);
      });
  }, [params]);

  return (
    <PageContainer className="flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
      <h1 className="text-2xl font-bold text-zinc-950">크레딧이 충전되지 않았습니다</h1>
      <p className="mt-3 max-w-md text-sm text-zinc-600">{message}</p>
      {balance !== null ? <p className="mt-2 text-sm text-zinc-500">잔액 {formatWon(balance)}</p> : null}
      <Link
        href="/my/credits"
        className="mt-6 inline-flex h-10 items-center rounded-full bg-clink px-4 text-sm font-semibold text-white"
      >
        다시 충전하기
      </Link>
    </PageContainer>
  );
}

export default function CreditChargeFailPage() {
  return (
    <AccessGuard allow="signed-in">
      <Suspense fallback={<PageContainer className="py-16 text-center text-sm text-zinc-500">확인 중입니다.</PageContainer>}>
        <CreditChargeFail />
      </Suspense>
    </AccessGuard>
  );
}
