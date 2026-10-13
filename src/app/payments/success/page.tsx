'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { pushNotification } from '@/lib/notifications';
import { UPDATE_FAIL_MESSAGE, awardBid, getAuctionById, getBidsByAuctionId } from '@/lib/auctions';
import { advertiserPayableAmount } from '@/lib/fees';
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
  const router = useRouter();
  const { user, ready } = useAuth();
  const params = useSearchParams();
  const started = useRef(false);
  const [message, setMessage] = useState('결제를 승인하고 낙찰을 확정하는 중입니다...');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [auctionHref, setAuctionHref] = useState('/');

  useEffect(() => {
    if (!ready || started.current) {
      return;
    }
    started.current = true;

    const run = async () => {
      const paymentKey = params.get('paymentKey')?.trim() ?? '';
      const orderId = params.get('orderId')?.trim() ?? '';
      const amount = Number(params.get('amount'));

      if (!paymentKey || !orderId || !Number.isInteger(amount) || amount <= 0) {
        setError('결제 결과 파라미터가 올바르지 않습니다. 낙찰은 진행되지 않았습니다.');
        return;
      }

      try {
        const confirmResponse = await fetch('/api/payments/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });
        const confirmPayload = (await confirmResponse.json().catch(() => null)) as
          | (ConfirmPaymentResult & { error?: string })
          | null;

        if (!confirmResponse.ok || !confirmPayload?.auctionId || !confirmPayload.bidId) {
          setError(
            confirmPayload?.error ||
              '결제 승인에 실패했습니다. 낙찰은 진행되지 않았습니다.',
          );
          return;
        }

        const [auctionResult, bidsResult] = await Promise.all([
          getAuctionById(confirmPayload.auctionId),
          getBidsByAuctionId(confirmPayload.auctionId),
        ]);
        const auction = auctionResult.data;
        const bid = (bidsResult.data ?? []).find((item) => item.id === confirmPayload.bidId);
        setAuctionHref(`/auctions/${confirmPayload.auctionId}`);

        if (!auction || !bid) {
          setError('결제된 캠페인 정보를 찾지 못했습니다. 낙찰은 자동으로 반영되지 않았습니다.');
          return;
        }

        if (advertiserPayableAmount(bid.bidAmount) !== confirmPayload.amount) {
          setError('결제 금액이 제안 금액과 일치하지 않아 낙찰을 중단했습니다.');
          return;
        }

        const awarded = await awardBid(confirmPayload.auctionId, confirmPayload.bidId);
        if (awarded.error && awarded.error !== VALIDATION.alreadyAwarded) {
          setError(awarded.error || UPDATE_FAIL_MESSAGE);
          return;
        }

        setMessage(
          `결제가 완료되었습니다. ${formatWon(confirmPayload.amount)}이 승인되었고 낙찰이 확정되었습니다.`,
        );
        setDone(true);
        showToast('낙찰이 확정되었고 역경매가 마감되었습니다.', 'success');
        const href = `/auctions/${confirmPayload.auctionId}`;
        pushNotification({
          userId: user?.id,
          type: 'payment_complete',
          title: '결제 완료',
          body: `"${auction.title}" 낙찰 결제가 승인되었습니다. ${formatWon(confirmPayload.amount)}`,
          href,
          toast: false,
        });
        pushNotification({
          userId: user?.id,
          type: 'award_complete',
          title: '낙찰 완료',
          body: `"${auction.title}" 매칭이 확정되었습니다.`,
          href,
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
        window.setTimeout(() => {
          router.replace(`/auctions/${confirmPayload.auctionId}`);
        }, 900);
      } catch (caught) {
        console.warn('[SponsorAuction] 결제 성공 처리 중 예외가 발생했습니다.', caught);
        setError('결제 처리 중 오류가 발생했습니다. 낙찰은 진행되지 않았을 수 있습니다.');
      }
    };

    void run();
  }, [params, ready, router, user?.id]);

  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        {error ? (
          <>
            <p className="text-sm font-semibold text-rose-700">결제 승인 실패</p>
            <h1 className="mt-2 text-xl font-bold text-zinc-950">낙찰이 확정되지 않았습니다</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600" role="alert">
              {error}
            </p>
            <Link
              href={auctionHref}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
            >
              캠페인으로 돌아가기
            </Link>
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
              {done ? '결제 완료' : '결제 승인 중'}
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600">{message}</p>
            {done ? (
              <Link
                href={auctionHref}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
              >
                캠페인 보기
              </Link>
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
