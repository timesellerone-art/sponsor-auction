'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { PAYMENT_VERIFY_PRODUCT_NAME } from '@/lib/payment-verify';
import { formatPaymentError, parsePaymentError } from '@/lib/payments/errors';
import { formatWon } from '@/lib/utils';

function SuccessFallback() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16">
      <Loader2 className="size-6 animate-spin text-clink-accent" aria-hidden />
      <p className="mt-4 text-sm text-zinc-600">결제 결과를 확인하고 있습니다...</p>
    </div>
  );
}

function PaymentVerifySuccessContent() {
  const params = useSearchParams();
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [amountLabel, setAmountLabel] = useState('');

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const run = async () => {
      const paymentKey = params.get('paymentKey')?.trim() ?? '';
      const confirmedOrderId = params.get('orderId')?.trim() ?? '';
      const amount = Number(params.get('amount'));
      setOrderId(confirmedOrderId);
      if (Number.isInteger(amount) && amount > 0) {
        setAmountLabel(formatWon(amount));
      }
      try {
        const response = await fetch('/api/payments/verify/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentKey, orderId: confirmedOrderId, amount }),
        });
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          errorMessage?: string;
          amount?: number;
        } | null;
        if (!response.ok) {
          throw new Error(payload?.errorMessage || payload?.error || '결제 승인에 실패했습니다.');
        }
        if (typeof payload?.amount === 'number') {
          setAmountLabel(formatWon(payload.amount));
        }
        setDone(true);
      } catch (caught) {
        setError(formatPaymentError(parsePaymentError(caught)));
      }
    };

    void run();
  }, [params]);

  if (error) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
        <h1 className="text-xl font-bold text-zinc-950">결제 승인에 실패했습니다</h1>
        <p className="mt-2 text-sm text-rose-700">{error}</p>
        <Link href="/payment-verify" className="mt-6 text-sm font-semibold text-clink-accent hover:underline">
          검수 페이지로 돌아가기
        </Link>
      </div>
    );
  }

  if (!done) {
    return <SuccessFallback />;
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <CheckCircle2 className="size-10 text-clink-accent" aria-hidden />
      <h1 className="mt-4 text-xl font-bold text-zinc-950">PG 검수 결제가 승인되었습니다</h1>
      <p className="mt-2 text-sm text-zinc-600">{PAYMENT_VERIFY_PRODUCT_NAME}</p>
      {amountLabel ? <p className="mt-1 text-sm font-semibold text-zinc-900">{amountLabel}</p> : null}
      {orderId ? <p className="mt-1 font-mono text-xs text-zinc-500">{orderId}</p> : null}
      <Link href="/payment-verify" className="mt-6 text-sm font-semibold text-clink-accent hover:underline">
        검수 페이지로 돌아가기
      </Link>
    </div>
  );
}

export default function PaymentVerifySuccessPage() {
  return (
    <Suspense fallback={<SuccessFallback />}>
      <PaymentVerifySuccessContent />
    </Suspense>
  );
}
