'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { COMPANY } from '@/lib/company';
import {
  PAYMENT_VERIFY_AMOUNTS,
  PAYMENT_VERIFY_DEFAULT_AMOUNT,
  PAYMENT_VERIFY_PRODUCT_NAME,
  PAYMENT_VERIFY_SERVICE_PERIOD,
  type PaymentVerifyAmount,
} from '@/lib/payment-verify';
import { formatPaymentError, formatPaymentToast, parsePaymentError } from '@/lib/payments/errors';
import { cn, formatWon } from '@/lib/utils';
import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';

type PreparedCheckout = {
  orderId: string;
  amount: number;
  orderName: string;
  customerKey: string;
  clientKey: string;
};

export function PaymentVerifyCheckout() {
  const titleId = useId();
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [amount, setAmount] = useState<PaymentVerifyAmount>(PAYMENT_VERIFY_DEFAULT_AMOUNT);
  const [checkout, setCheckout] = useState<PreparedCheckout | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [agreeRefund, setAgreeRefund] = useState(false);

  useEffect(() => {
    let cancelled = false;
    widgetsRef.current = null;
    setReady(false);
    setLoadError(null);
    setCheckout(null);

    const boot = async () => {
      try {
        const response = await fetch('/api/payments/verify/prepare', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount }),
        });
        const payload = (await response.json().catch(() => null)) as
          | (PreparedCheckout & { error?: string; errorMessage?: string })
          | null;
        if (!response.ok || !payload?.orderId || !payload.clientKey) {
          throw new Error(payload?.errorMessage || payload?.error || '결제를 준비하지 못했습니다.');
        }
        if (cancelled) {
          return;
        }
        setCheckout(payload);

        const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
        const tossPayments = await loadTossPayments(payload.clientKey);
        const widgets = tossPayments.widgets({ customerKey: payload.customerKey });
        await widgets.setAmount({ currency: 'KRW', value: payload.amount });
        await Promise.all([
          widgets.renderPaymentMethods({
            selector: '#payment-verify-method',
            variantKey: 'DEFAULT',
          }),
          widgets.renderAgreement({
            selector: '#payment-verify-agreement',
            variantKey: 'AGREEMENT',
          }),
        ]);
        if (cancelled) {
          return;
        }
        widgetsRef.current = widgets;
        setReady(true);
      } catch (error) {
        if (!cancelled) {
          const info = parsePaymentError(error);
          setLoadError(formatPaymentError(info));
          setReady(false);
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [amount]);

  const handlePay = async () => {
    if (!checkout || !widgetsRef.current || busy || !agreeRefund) {
      return;
    }
    setBusy(true);
    try {
      const origin = window.location.origin;
      await widgetsRef.current.requestPayment({
        orderId: checkout.orderId,
        orderName: checkout.orderName,
        successUrl: `${origin}/payment-verify/success`,
        failUrl: `${origin}/payment-verify/fail`,
      });
    } catch (error) {
      const info = parsePaymentError(error);
      const feedback = formatPaymentToast(info);
      const { showToast } = await import('@/components/Toast');
      showToast(feedback.text, feedback.variant, 9000);
      setBusy(false);
    }
  };

  return (
    <section className="mx-auto w-full max-w-lg min-w-0 flex-1 px-4 py-8 sm:px-6 sm:py-12" aria-labelledby={titleId}>
      <p className="text-sm font-semibold tracking-wide text-clink-accent">PG 심사 검수</p>
      <h1 id={titleId} className="mt-1 text-2xl font-bold break-keep text-zinc-950 sm:text-3xl">
        결제 테스트
      </h1>
      <p className="mt-2 text-sm leading-6 text-zinc-600">
        토스페이먼츠 및 카드사 심사역이 로그인 없이 결제창 호출과 승인 흐름을 확인할 수 있는
        공개 검수 페이지입니다.
      </p>

      <div className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <div>
          <p className="text-xs font-medium text-zinc-500">서비스(상품)명</p>
          <p className="mt-1 text-base font-semibold text-zinc-950">{PAYMENT_VERIFY_PRODUCT_NAME}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-zinc-500">결제 금액 (VAT 포함)</p>
          <div className="mt-2 flex gap-2">
            {PAYMENT_VERIFY_AMOUNTS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setAmount(option)}
                className={cn(
                  'rounded-full px-4 py-2 text-sm font-semibold',
                  amount === option
                    ? 'bg-clink text-white'
                    : 'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50',
                )}
              >
                {formatWon(option)}
                {option === 1000 ? ' (기본)' : ' 테스트'}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-[#FAF8F5] px-4 py-3 text-sm leading-6 text-zinc-700">
          <p>
            <span className="font-semibold">서비스 제공 기간:</span> {PAYMENT_VERIFY_SERVICE_PERIOD}
          </p>
          <p className="mt-2">
            <span className="font-semibold">환불 규정:</span> 매칭 확정 및 작업 시작 전에는 결제
            금액 100% 전액 환불, 용역 제공 개시 후에는 진행률·합의 기준에 따른 부분 환불 또는
            환불 불가. 환불 승인일로부터 영업일 3~5일 이내 결제 수단 원복.{' '}
            <Link href="/refund" className="font-semibold text-clink-accent hover:underline">
              환불 및 취소 규정
            </Link>
          </p>
        </div>

        {loadError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950" role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <div id="payment-verify-method" className="min-h-40 min-w-0" />
            <div id="payment-verify-agreement" className="min-w-0" />
          </>
        )}

        <label className="flex items-start gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={agreeRefund}
            onChange={(event) => setAgreeRefund(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-clink"
            aria-label="구매 조건 확인 및 환불 규정에 동의합니다"
          />
          <span>
            구매 조건 확인 및{' '}
            <Link href="/refund" className="font-semibold text-clink-accent hover:underline">
              환불 규정
            </Link>
            에 동의합니다 (필수)
          </span>
        </label>

        <button
          type="button"
          disabled={busy || !ready || !agreeRefund || !checkout}
          onClick={() => {
            void handlePay();
          }}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {busy ? '결제 요청 중...' : `${formatWon(amount)} 결제하기`}
        </button>
        <p className="text-xs text-zinc-500">
          운영 주체 {COMPANY.legalName} · 사업자등록번호 {COMPANY.businessNo} · 사업장 소재지{' '}
          {COMPANY.address} · 고객센터 {COMPANY.phone}
        </p>
      </div>
    </section>
  );
}
