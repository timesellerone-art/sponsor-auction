'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AccessGuard } from '@/components/AccessGuard';
import { PageContainer } from '@/components/PageContainer';
import { formatWon } from '@/lib/utils';

function CreditChargeSuccess() {
  const params = useSearchParams();
  const started = useRef(false);
  const [message, setMessage] = useState('충전 결제를 확인하고 있습니다.');
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const orderId = params.get('orderId')?.trim() ?? '';
    const paymentKey = params.get('paymentKey')?.trim() ?? '';
    const amount = Number(params.get('amount'));
    if (!orderId || !paymentKey || !Number.isInteger(amount)) {
      setError('결제 승인 정보가 없습니다.');
      return;
    }

    void fetch('/api/credits/charge/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, paymentKey, amount }),
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
          errorCode?: string;
          balance?: number | null;
          code?: string;
        } | null;
        if (!response.ok) {
          setError(body?.error || '크레딧을 충전하지 못했습니다.');
          if (typeof body?.balance === 'number') {
            setBalance(body.balance);
          }
          return;
        }
        setBalance(typeof body?.balance === 'number' ? body.balance : null);
        setMessage(body?.code === 'DUPLICATE_REFERENCE' ? '이미 충전된 결제입니다.' : '크레딧 충전이 완료되었습니다.');
      })
      .catch(() => {
        setError('크레딧을 충전하지 못했습니다.');
      });
  }, [params]);

  return (
    <PageContainer className="flex min-h-[50vh] flex-col items-center justify-center py-16 text-center">
      {error ? (
        <>
          <h1 className="text-2xl font-bold text-zinc-950">충전되지 않았습니다</h1>
          <p className="mt-3 max-w-md text-sm text-rose-600">{error}</p>
        </>
      ) : balance === null ? (
        <>
          <Loader2 className="size-6 animate-spin text-clink-accent" />
          <p className="mt-4 text-sm text-zinc-600">{message}</p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold text-zinc-950">{message}</h1>
          <p className="mt-3 text-sm text-zinc-600">현재 잔액 {formatWon(balance)}</p>
        </>
      )}
      <Link
        href="/my/credits"
        className="mt-6 inline-flex h-10 items-center rounded-full bg-clink px-4 text-sm font-semibold text-white"
      >
        크레딧으로 돌아가기
      </Link>
    </PageContainer>
  );
}

export default function CreditChargeSuccessPage() {
  return (
    <AccessGuard allow={['advertiser', 'admin']}>
      <Suspense fallback={<PageContainer className="py-16 text-center text-sm text-zinc-500">확인 중입니다.</PageContainer>}>
        <CreditChargeSuccess />
      </Suspense>
    </AccessGuard>
  );
}
