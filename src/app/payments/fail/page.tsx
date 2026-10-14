'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { showToast } from '@/components/Toast';
import { formatPaymentToast, parsePaymentError } from '@/lib/payments/errors';

function FailFallback() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="h-40 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

function decodeParam(value: string | null) {
  if (!value) {
    return '';
  }
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function PaymentFailContent() {
  const params = useSearchParams();
  const info = parsePaymentError({
    code:
      decodeParam(params.get('code')) ||
      decodeParam(params.get('errorCode')) ||
      'PAY_PROCESS_CANCELED',
    message:
      decodeParam(params.get('message')) ||
      decodeParam(params.get('errorMessage')) ||
      '결제창에서 취소되었거나 인증이 완료되지 않았습니다.',
  });
  const orderId = decodeParam(params.get('orderId'));
  const feedback = formatPaymentToast(info);
  const cancelled = info.kind === 'cancel';

  useEffect(() => {
    if (cancelled) {
      console.info('[SponsorAuction] 결제 failUrl 취소', {
        errorCode: info.code,
        errorMessage: info.message,
        orderId,
      });
    } else {
      console.error('[SponsorAuction] 결제 failUrl 실패', {
        errorCode: info.code,
        errorMessage: info.message,
        orderId,
      });
    }
    showToast(feedback.text, feedback.variant, 9000);
    if (!orderId) {
      return;
    }

    void fetch('/api/payments/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId }),
    }).catch((error) => {
      console.error('[SponsorAuction] 결제 취소 API 호출 실패', error);
    });
  }, [cancelled, feedback.text, feedback.variant, info.code, info.message, orderId]);

  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className={`text-sm font-semibold ${cancelled ? 'text-amber-800' : 'text-rose-700'}`}>
          {cancelled ? '결제 취소' : '결제 실패'}
        </p>
        <h1 className="mt-2 text-xl font-bold text-zinc-950">{feedback.title}</h1>
        <p className="mt-3 font-mono text-xs text-zinc-500" role="alert">
          [{info.code}] {info.message}
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-600">{info.hint}</p>
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
