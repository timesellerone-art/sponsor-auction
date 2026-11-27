'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FeeBreakdownCard } from '@/components/fee/FeeBreakdownCard';
import { PaymentCheckoutModal } from '@/components/PaymentCheckoutModal';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
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
  const [checkout, setCheckout] = useState<PreparePaymentResult | null>(null);
  const { isBusy, run } = useActionLock();

  const payWithToss = async () => {
    await run('slot-pay-toss', async () => {
      const prepared = await prepareAwardPayment({
        auction: timeSlotToAuctionItem(slot),
        bid: timeSlotBidToBidItem(bid, slot),
        kind: 'timeslot',
      });
      if (prepared.error || !prepared.data) {
        showToast(prepared.error || '토스페이먼츠 단건 에스크로 결제를 준비하지 못했습니다.');
        return;
      }
      setCheckout(prepared.data);
    });
  };

  return (
    <section className="rounded-2xl border border-clink-peach-strong bg-white p-4 sm:p-6">
      <h2 className="text-lg font-bold text-zinc-950">최종 단건 에스크로 결제</h2>
      <p className="mt-1 text-sm text-zinc-500">
        선정된 크리에이터 상품의 사전 확정 용역비에 광고주 수수료 15%와 부가세 10%를 더한 금액
        1건을 토스페이먼츠 에스크로로 예치합니다.
      </p>
      <div className="mt-4">
        <FeeBreakdownCard
          role="advertiser"
          amount={bid.bidAmount}
          dealKind="timeslot"
          dealTitle={slot.title}
          counterpartyName={slot.creatorName}
        />
      </div>
      <p className="mt-3 text-sm font-semibold text-zinc-950">
        최종 단건 결제 금액 {formatWon(quote.amount)}
      </p>
      <div className="mt-4">
        <button
          type="button"
          disabled={isBusy}
          onClick={() => {
            void payWithToss();
          }}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
          토스페이먼츠로 단건 에스크로 결제
        </button>
      </div>
      <PaymentCheckoutModal
        open={Boolean(checkout)}
        checkout={checkout}
        onClose={() => {
          setCheckout(null);
          onPaid?.();
        }}
      />
    </section>
  );
}
