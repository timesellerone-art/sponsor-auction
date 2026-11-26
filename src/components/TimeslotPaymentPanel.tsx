'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CreditChargeModal } from '@/components/CreditChargeModal';
import { FeeBreakdownCard } from '@/components/fee/FeeBreakdownCard';
import { PaymentCheckoutModal } from '@/components/PaymentCheckoutModal';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { authRequestInit } from '@/lib/auth-request';
import { campaignHoldQuote } from '@/lib/campaign-credit';
import { prepareAwardPayment } from '@/lib/payments/client';
import { timeSlotBidToBidItem, timeSlotToAuctionItem } from '@/lib/timeslot-deal';
import { formatWon } from '@/lib/utils';
import type { PreparePaymentResult } from '@/types/payment';
import type { TimeSlotBidItem, TimeSlotItem } from '@/types/timeslot';

export function TimeslotPaymentPanel({
  slot,
  bid,
  onPaid,
}: {
  slot: TimeSlotItem;
  bid: TimeSlotBidItem;
  onPaid?: () => void;
}) {
  const quote = campaignHoldQuote(bid.bidAmount);
  const [chargeNeeded, setChargeNeeded] = useState<number | null>(null);
  const [checkout, setCheckout] = useState<PreparePaymentResult | null>(null);
  const { isBusy, run } = useActionLock();

  const payWithCredit = async () => {
    await run('slot-pay', async () => {
      try {
        const response = await fetch(
          `/api/timeslots/${encodeURIComponent(slot.id)}/pay`,
          await authRequestInit({
            method: 'POST',
            body: JSON.stringify({ bidId: bid.id }),
          }),
        );
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
          errorMessage?: string;
          errorCode?: string;
          neededAmount?: number;
        } | null;
        if (response.status === 402 || payload?.errorCode === 'INSUFFICIENT_CREDIT') {
          const needed =
            typeof payload?.neededAmount === 'number' && payload.neededAmount > 0
              ? payload.neededAmount
              : quote.amount;
          setChargeNeeded(needed);
          showToast(payload?.errorMessage || payload?.error || '크레딧이 부족합니다. 충전 후 다시 결제해 주세요.');
          return;
        }
        if (!response.ok) {
          showToast(payload?.errorMessage || payload?.error || '결제하지 못했습니다.');
          return;
        }
        showToast('결제를 완료했습니다. 에스크로에 예치되었습니다.', 'success');
        window.dispatchEvent(new Event('timeslots:changed'));
        window.dispatchEvent(new Event('auctions:changed'));
        window.dispatchEvent(new Event('payouts:changed'));
        onPaid?.();
      } catch {
        showToast('결제하지 못했습니다.');
      }
    });
  };

  const payWithToss = async () => {
    await run('slot-pay-toss', async () => {
      const prepared = await prepareAwardPayment({
        auction: timeSlotToAuctionItem(slot),
        bid: timeSlotBidToBidItem(bid, slot),
        kind: 'timeslot',
      });
      if (prepared.error || !prepared.data) {
        showToast(prepared.error || '결제를 준비하지 못했습니다.');
        return;
      }
      setCheckout(prepared.data);
    });
  };

  return (
    <section className="rounded-2xl border border-clink-peach-strong bg-white p-4 sm:p-6">
      <h2 className="text-lg font-bold text-zinc-950">최종 결제</h2>
      <p className="mt-1 text-sm text-zinc-500">
        제안이 선정되었습니다. 제안가에 광고주 수수료 15%와 부가세 10%를 더한 금액을 결제하면
        거래가 진행 중(에스크로 예치)으로 바뀝니다.
      </p>
      <div className="mt-4">
        <FeeBreakdownCard role="advertiser" amount={bid.bidAmount} />
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-950">
        결제 금액 {formatWon(quote.amount)}
      </p>
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            void payWithCredit();
          }}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
          결제하기
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            void payWithToss();
          }}
          className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-60"
        >
          토스페이먼츠 결제
        </button>
      </div>
      <CreditChargeModal
        open={chargeNeeded != null}
        neededAmount={chargeNeeded ?? 0}
        hint={
          chargeNeeded
            ? `크리에이터 상품 결제액(공급가액 + 부가세 10%)은 ${formatWon(chargeNeeded)}입니다. 충전 후 다시 결제해 주세요.`
            : undefined
        }
        onClose={() => setChargeNeeded(null)}
      />
      <PaymentCheckoutModal
        open={Boolean(checkout)}
        checkout={checkout}
        onClose={() => setCheckout(null)}
      />
    </section>
  );
}
