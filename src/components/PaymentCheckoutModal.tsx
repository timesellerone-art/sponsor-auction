'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { getTossClientKey } from '@/lib/payments/env';
import {
  formatPaymentError,
  formatPaymentToast,
  parsePaymentError,
  serializePaymentError,
  type PaymentErrorInfo,
} from '@/lib/payments/errors';
import { cn, formatWon } from '@/lib/utils';
import type { TossPaymentsWidgets } from '@tosspayments/tosspayments-sdk';
import type { PaymentMethod, PreparePaymentResult } from '@/types/payment';

type PaymentCheckoutModalProps = {
  open: boolean;
  checkout: PreparePaymentResult | null;
  onClose: () => void;
};

const METHOD_OPTIONS: { value: PaymentMethod; label: string; hint: string }[] = [
  { value: 'CARD', label: '신용·체크카드', hint: '국내 카드' },
  { value: 'TRANSFER', label: '계좌이체', hint: '퀵계좌이체' },
  { value: 'EASY_PAY', label: '간편결제', hint: '토스페이 등' },
];

function resolveClientKey(checkout: PreparePaymentResult | null) {
  return checkout?.clientKey?.trim() || getTossClientKey() || '';
}

export function PaymentCheckoutModal({
  open,
  checkout,
  onClose,
}: PaymentCheckoutModalProps) {
  const titleId = useId();
  const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>('CARD');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payError, setPayError] = useState<PaymentErrorInfo | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [busy, onClose, open]);

  useEffect(() => {
    if (!open || !checkout) {
      widgetsRef.current = null;
      setReady(false);
      setLoadError(null);
      setPayError(null);
      return;
    }

    let cancelled = false;

    const boot = async () => {
      setReady(false);
      setLoadError(null);

      const clientKey = resolveClientKey(checkout);
      if (!clientKey) {
        setReady(true);
        return;
      }

      try {
        const { loadTossPayments } = await import('@tosspayments/tosspayments-sdk');
        const tossPayments = await loadTossPayments(clientKey);
        const widgets = tossPayments.widgets({ customerKey: checkout.customerKey });
        await widgets.setAmount({ currency: 'KRW', value: checkout.amount });
        await Promise.all([
          widgets.renderPaymentMethods({
            selector: '#toss-payment-method',
            variantKey: 'DEFAULT',
          }),
          widgets.renderAgreement({
            selector: '#toss-agreement',
            variantKey: 'AGREEMENT',
          }),
        ]);
        if (cancelled) {
          return;
        }
        widgetsRef.current = widgets;
        setReady(true);
      } catch (error) {
        const info = parsePaymentError(error);
        console.error('[SponsorAuction] 토스페이먼츠 위젯 로딩에 실패했습니다.', {
          errorCode: info.code,
          errorMessage: info.message,
          error,
        });
        if (!cancelled) {
          setLoadError(
            `${formatPaymentError(info)} 결제 수단을 불러오지 못했습니다. 데모 결제로 진행할 수 있습니다.`,
          );
          setReady(true);
        }
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [checkout, open]);

  if (!open || !checkout || typeof document === 'undefined') {
    return null;
  }

  const successUrl = `${window.location.origin}/payments/success`;
  const failUrl = `${window.location.origin}/payments/fail`;
  const clientKey = resolveClientKey(checkout);
  const isDemoCheckout = !clientKey;
  const useToss = Boolean(widgetsRef.current) && !isDemoCheckout && !loadError;

  const handlePay = async () => {
    if (busy || !ready) {
      return;
    }

    setBusy(true);
    setPayError(null);
    try {
      if (useToss && widgetsRef.current) {
        await widgetsRef.current.requestPayment({
          orderId: checkout.orderId,
          orderName: checkout.orderName,
          successUrl,
          failUrl,
        });
        return;
      }

      const paymentKey = `demo_${checkout.orderId}`;
      const params = new URLSearchParams({
        paymentKey,
        orderId: checkout.orderId,
        amount: String(checkout.amount),
        method,
      });
      window.location.assign(`${successUrl}?${params.toString()}`);
    } catch (error) {
      const info = parsePaymentError(error);
      const feedback = formatPaymentToast(info);
      const logPayload = {
        errorCode: info.code,
        errorMessage: info.message,
        kind: info.kind,
        cancelled: info.cancelled,
        aborted: info.aborted,
        orderId: checkout.orderId,
        raw: serializePaymentError(error),
      };

      if (info.kind === 'cancel' || info.aborted) {
        console.info('[SponsorAuction] 결제 취소 또는 중단', logPayload);
      } else {
        console.error('[SponsorAuction] 결제 요청 실패', logPayload);
      }

      if (info.aborted) {
        setBusy(false);
        return;
      }

      setPayError(info);
      showToast(feedback.text, feedback.variant, 9000);
      setBusy(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4"
      onClick={busy ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative my-auto flex max-h-[85vh] w-full max-w-lg min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-950">
              안전결제
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {checkout.orderName} · 주문 {checkout.orderId}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            aria-label="닫기"
            disabled={busy}
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="rounded-xl bg-teal-50 px-4 py-3">
            <p className="text-xs font-semibold text-teal-800">광고주 결제 금액</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-zinc-950">
              {formatWon(checkout.amount)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              제안 금액 + 10% 안전결제 수수료. 결제 완료 후에만 낙찰이 확정됩니다.
            </p>
          </div>

          {payError ? (
            <div
              role="alert"
              className={cn(
                'rounded-xl border px-4 py-3 text-sm leading-6',
                payError.kind === 'cancel'
                  ? 'border-amber-200 bg-amber-50 text-amber-950'
                  : 'border-rose-200 bg-rose-50 text-rose-950',
              )}
            >
              <p className="font-semibold">
                {payError.kind === 'cancel' ? '결제를 취소했습니다' : '결제에 실패했습니다'}
              </p>
              <p className="mt-1 font-mono text-xs">{formatPaymentError(payError)}</p>
              <p className="mt-1 text-xs text-zinc-600">{payError.hint}</p>
            </div>
          ) : null}

          {isDemoCheckout || loadError ? (
            <fieldset className="min-w-0">
              <legend className="text-sm font-medium text-zinc-800">결제 수단</legend>
              {loadError ? (
                <p className="mt-1 text-xs text-amber-700">{loadError}</p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">
                  토스페이먼츠 키가 없어 데모 결제로 진행합니다.
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                {METHOD_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer items-center justify-between rounded-xl border px-3 py-3 text-sm',
                      method === option.value
                        ? 'border-teal-600 bg-teal-50'
                        : 'border-zinc-200 bg-white',
                    )}
                  >
                    <span>
                      <span className="font-semibold text-zinc-950">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">{option.hint}</span>
                    </span>
                    <input
                      type="radio"
                      name="payment-method"
                      value={option.value}
                      checked={method === option.value}
                      onChange={() => setMethod(option.value)}
                      className="size-4 accent-teal-700"
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <>
              <div id="toss-payment-method" className="min-h-40 min-w-0" />
              <div id="toss-agreement" className="min-w-0" />
            </>
          )}
        </div>

        <div className="flex shrink-0 gap-2 border-t border-zinc-200 px-4 py-3 sm:px-5">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-zinc-200 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy || !ready}
            onClick={() => {
              void handlePay();
            }}
            className="inline-flex h-11 flex-[1.4] items-center justify-center gap-2 rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? '결제 요청 중...' : '결제하기'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
