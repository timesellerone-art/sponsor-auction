'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { pushNotification } from '@/lib/notifications';
import { UPDATE_FAIL_MESSAGE, awardBid, getAuctionById, getBidsByAuctionId } from '@/lib/auctions';
import { advertiserPayableAmount } from '@/lib/fees';
import { readCheckoutContext, recoverAuctionHref } from '@/lib/payments/client';
import { formatPaymentToast, parsePaymentError } from '@/lib/payments/errors';
import { publicSupabasePayload } from '@/lib/supabase/env';
import { formatWon } from '@/lib/utils';
import { VALIDATION } from '@/lib/validation';
import type { ConfirmPaymentResult } from '@/types/payment';

function SuccessFallback() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16">
      <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
      <p className="mt-4 text-sm text-zinc-600">결제 결과를 확인하고 있습니다...</p>
    </div>
  );
}

function PaymentSuccessContent() {
  const { user, ready } = useAuth();
  const params = useSearchParams();
  const started = useRef(false);
  const [message, setMessage] = useState('결제를 승인하고 낙찰을 확정하는 중입니다...');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [orderId, setOrderId] = useState('');
  const [amountLabel, setAmountLabel] = useState('');
  const [auctionHref, setAuctionHref] = useState('/my');

  useEffect(() => {
    if (!ready || started.current) {
      return;
    }
    started.current = true;

    const run = async () => {
      const paymentKey = params.get('paymentKey')?.trim() ?? '';
      const confirmedOrderId = params.get('orderId')?.trim() ?? '';
      const amount = Number(params.get('amount'));
      const stored = readCheckoutContext(confirmedOrderId);
      const auctionId =
        params.get('auctionId')?.trim() ||
        params.get('auction_id')?.trim() ||
        stored?.auctionId ||
        '';
      const bidId =
        params.get('bidId')?.trim() ||
        params.get('bid_id')?.trim() ||
        stored?.bidId ||
        '';

      setOrderId(confirmedOrderId);
      if (Number.isInteger(amount) && amount > 0) {
        setAmountLabel(formatWon(amount));
      }
      setAuctionHref(recoverAuctionHref(auctionId));

      if (!paymentKey || !confirmedOrderId || !Number.isInteger(amount) || amount <= 0) {
        const info = parsePaymentError({
          code: 'INVALID_SUCCESS_PARAMS',
          message: '결제 결과 파라미터가 올바르지 않습니다. 낙찰은 진행되지 않았습니다.',
        });
        const feedback = formatPaymentToast(info);
        console.error('[SponsorAuction] 결제 성공 URL 파라미터 오류', {
          errorCode: info.code,
          errorMessage: info.message,
          paymentKey,
          orderId: confirmedOrderId,
          amount,
        });
        showToast(feedback.text, feedback.variant, 9000);
        setError(`[${info.code}] ${info.message}`);
        return;
      }

      try {
        console.info('[SponsorAuction] 결제 승인 요청', {
          orderId: confirmedOrderId,
          amount,
          auctionId,
          bidId,
        });
        const confirmResponse = await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            paymentKey,
            orderId: confirmedOrderId,
            amount,
            auctionId,
            bidId,
            auction_id: auctionId,
            bid_id: bidId,
            ...publicSupabasePayload(),
          }),
        });
        const confirmPayload = (await confirmResponse.json().catch(() => null)) as
          | ConfirmPaymentResult
          | null;

        if (!confirmResponse.ok || !confirmPayload?.auctionId || !confirmPayload.bidId) {
          const info = parsePaymentError({
            code: confirmPayload?.errorCode || `HTTP_${confirmResponse.status}`,
            message:
              confirmPayload?.errorMessage ||
              confirmPayload?.error ||
              '결제 승인에 실패했습니다. 낙찰은 진행되지 않았습니다.',
          });
          const feedback = formatPaymentToast(info);
          console.error('[SponsorAuction] 결제 승인 실패', {
            paymentKey,
            orderId: confirmedOrderId,
            amount,
            httpStatus: confirmResponse.status,
            errorCode: info.code,
            errorMessage: info.message,
            supabaseError: (confirmPayload as { supabaseError?: unknown } | null)?.supabaseError,
            payload: confirmPayload,
          });
          showToast(feedback.text, feedback.variant, 9000);
          setError(`[${info.code}] ${info.message}\n${info.hint}`);
          return;
        }

        setOrderId(confirmPayload.orderId || confirmedOrderId);
        setAmountLabel(formatWon(confirmPayload.amount));
        setAuctionHref(recoverAuctionHref(confirmPayload.auctionId));

        const [auctionResult, bidsResult] = await Promise.all([
          getAuctionById(confirmPayload.auctionId),
          getBidsByAuctionId(confirmPayload.auctionId),
        ]);
        const auction = auctionResult.data;
        const bid = (bidsResult.data ?? []).find((item) => item.id === confirmPayload.bidId);

        if (!auction || !bid) {
          const info = parsePaymentError({
            code: 'AWARD_TARGET_NOT_FOUND',
            message: '결제된 캠페인 정보를 찾지 못했습니다. 낙찰은 자동으로 반영되지 않았습니다.',
          });
          const feedback = formatPaymentToast(info);
          showToast(feedback.text, 'error', 9000);
          setError(`[${info.code}] ${info.message}`);
          return;
        }

        if (advertiserPayableAmount(bid.bidAmount) !== confirmPayload.amount) {
          const info = parsePaymentError({
            code: 'AMOUNT_MISMATCH',
            message: '결제 금액이 제안 금액과 일치하지 않아 낙찰을 중단했습니다.',
          });
          const feedback = formatPaymentToast(info);
          showToast(feedback.text, 'error', 9000);
          setError(`[${info.code}] ${info.message}`);
          return;
        }

        const awarded = await awardBid(confirmPayload.auctionId, confirmPayload.bidId);
        if (awarded.error && awarded.error !== VALIDATION.alreadyAwarded) {
          const info = parsePaymentError({
            code: 'AWARD_FAILED',
            message: awarded.error || UPDATE_FAIL_MESSAGE,
          });
          const feedback = formatPaymentToast(info);
          showToast(feedback.text, 'error', 9000);
          setError(`[${info.code}] ${info.message}`);
          return;
        }

        setMessage('결제 및 낙찰이 완료되었습니다');
        setDone(true);
        showToast('낙찰이 확정되었고 역경매가 마감되었습니다.', 'success');
        const href = recoverAuctionHref(confirmPayload.auctionId);
        pushNotification({
          userId: user?.id,
          type: 'payment_complete',
          title: '결제 완료',
          body: `"${auction.title}" 낙찰 결제가 승인되었습니다. ${formatWon(confirmPayload.amount)}`,
          href: '/my',
          toast: false,
        });
        pushNotification({
          userId: user?.id,
          type: 'award_complete',
          title: '낙찰 완료',
          body: `"${auction.title}" 매칭이 확정되었습니다.`,
          href: '/my',
          toast: false,
        });
        if (bid.creatorId && bid.creatorId !== user?.id) {
          pushNotification({
            userId: bid.creatorId,
            type: 'award_complete',
            title: '낙찰 완료',
            body: `"${auction.title}" 제안이 낙찰되었습니다.`,
            href,
            toast: false,
          });
        }
        window.dispatchEvent(new Event('auctions:changed'));
      } catch (caught) {
        const info = parsePaymentError({
          code: 'CONFIRM_CLIENT_EXCEPTION',
          message: caught instanceof Error ? caught.message : '결제 처리 중 오류가 발생했습니다.',
        });
        const feedback = formatPaymentToast(info);
        console.error('[SponsorAuction] 결제 성공 처리 중 예외가 발생했습니다.', {
          errorCode: info.code,
          errorMessage: info.message,
          error: caught,
        });
        showToast(feedback.text, feedback.variant, 9000);
        setError(`[${info.code}] ${info.message}`);
      }
    };

    void run();
  }, [params, ready, user?.id]);

  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {error ? (
          <>
            <p className="text-sm font-semibold text-rose-700">결제 승인 실패</p>
            <h1 className="mt-2 text-xl font-bold text-zinc-950">낙찰이 확정되지 않았습니다</h1>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-600" role="alert">
              {error}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href={auctionHref}
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
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-teal-800">
              {done ? (
                <CheckCircle2 className="size-5" aria-hidden />
              ) : (
                <Loader2 className="size-5 animate-spin" aria-hidden />
              )}
              <p className="text-sm font-semibold">안전결제</p>
            </div>
            <h1 className="mt-2 text-xl font-bold text-zinc-950">
              {done ? '결제 및 낙찰이 완료되었습니다' : '결제 승인 중'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{message}</p>
            {done ? (
              <>
                <dl className="mt-5 grid grid-cols-1 gap-3 rounded-xl bg-zinc-50 px-4 py-3 text-sm">
                  <div>
                    <dt className="text-xs text-zinc-400">주문번호</dt>
                    <dd className="mt-0.5 break-all font-medium text-zinc-950">{orderId || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-zinc-400">결제금액</dt>
                    <dd className="mt-0.5 font-medium text-zinc-950">{amountLabel || '—'}</dd>
                  </div>
                </dl>
                <div className="mt-6 flex flex-col gap-2">
                  <Link
                    href="/my"
                    className="inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
                  >
                    마이페이지(대시보드)로 이동
                  </Link>
                  <Link
                    href={auctionHref}
                    className="inline-flex h-11 w-full items-center justify-center rounded-full border border-zinc-200 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    캠페인 보기
                  </Link>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<SuccessFallback />}>
      <PaymentSuccessContent />
    </Suspense>
  );
}
