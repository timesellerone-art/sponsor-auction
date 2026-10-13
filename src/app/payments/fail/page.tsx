'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { showToast } from '@/components/Toast';

function FailFallback() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="h-40 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

function PaymentFailContent() {
  const params = useSearchParams();
  const message =
    params.get('message')?.trim() ||
    params.get('code')?.trim() ||
    '결제가 취소되었거나 실패했습니다.';
  const orderId = params.get('orderId')?.trim() ?? '';

  useEffect(() => {
    showToast('결제가 완료되지 않아 낙찰은 진행되지 않았습니다.');
    if (!orderId) {
      return;
    }

    void fetch('/api/payments/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).catch(() => undefined);
  }, [orderId]);

  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-rose-700">결제 실패</p>
        <h1 className="mt-2 text-xl font-bold text-zinc-950">낙찰이 확정되지 않았습니다</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600" role="alert">
          {message} 결제 도중 창을 닫아도 캠페인 상태는 그대로 유지됩니다.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
        >
          홈으로 돌아가기
        </Link>
      </div>
    </div>
  );
}

export default function PaymentFailPage() {
  return (
    <Suspense fallback={<FailFallback />}>
      <PaymentFailContent />
    </Suspense>
  );
}
