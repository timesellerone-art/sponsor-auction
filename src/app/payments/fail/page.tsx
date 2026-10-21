'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { showToast } from '@/components/Toast';
import { readCheckoutContext, recoverAuctionHref } from '@/lib/payments/client';
import { formatPaymentToast, parsePaymentError } from '@/lib/payments/errors';
import { publicSupabasePayload } from '@/lib/supabase/env';
import { formatWon } from '@/lib/utils';

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
  const orderId = decodeParam(params.get('orderId'));
  const stored = readCheckoutContext(orderId || undefined);
  const auctionId =
    decodeParam(params.get('auctionId')) ||
    decodeParam(params.get('auction_id')) ||
    stored?.auctionId ||
    '';
  const retryHref = recoverAuctionHref(auctionId);
  const amountRaw = decodeParam(params.get('amount'));
  const amount = Number(amountRaw);
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
  const feedback = formatPaymentToast(info);
  const cancelled = info.kind === 'cancel';
  const amountLabel =
    Number.isInteger(amount) && amount > 0
      ? formatWon(amount)
      : stored?.amount
        ? formatWon(stored.amount)
        : '';

  useEffect(() => {
    if (cancelled) {
      console.info('[SponsorAuction] 결제 failUrl 취소', {
        errorCode: info.code,
        errorMessage: info.message,
        orderId,
        auctionId,
      });
    } else {
      console.error('[SponsorAuction] 결제 failUrl 실패', {
        errorCode: info.code,
        errorMessage: info.message,
        orderId,
        auctionId,
      });
    }
    showToast(feedback.text, feedback.variant, 9000);
    if (!orderId) {
      return;
    }

    void fetch('/api/payments/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId, ...publicSupabasePayload() }),
    }).catch((error) => {
      console.error('[SponsorAuction] 결제 취소 API 호출 실패', error);
    });
  }, [
    auctionId,
    cancelled,
    feedback.text,
    feedback.variant,
    info.code,
    info.message,
    orderId,
  ]);

  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className={`text-sm font-semibold ${cancelled ? 'text-amber-800' : 'text-rose-700'}`}>
          {cancelled ? '결제 취소' : '결제 실패'}
        </p>
        <h1 className="mt-2 text-xl font-bold text-zinc-950">{feedback.title}</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{info.hint}</p>
        <p className="mt-3 rounded-xl bg-zinc-50 px-3 py-2 font-mono text-xs text-zinc-600" role="alert">
          [{info.code}] {info.message}
        </p>
        {(orderId || amountLabel) ? (
          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm text-zinc-600">
            {orderId ? (
              <div>
                <dt className="text-xs text-zinc-400">주문번호</dt>
                <dd className="break-all">{orderId}</dd>
              </div>
            ) : null}
            {amountLabel ? (
              <div>
                <dt className="text-xs text-zinc-400">결제 시도 금액</dt>
                <dd>{amountLabel}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href={retryHref}
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
          >
            다시 시도하기
          </Link>
          <Link
            href="/my"
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-zinc-200 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            마이페이지(대시보드)로 이동
          </Link>
        </div>
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
