import { advertiserPayableAmount } from '@/lib/fees';
import type { PreparePaymentResult } from '@/types/payment';
import type { AuctionItem, BidItem } from '@/types/auction';

export async function prepareAwardPayment(input: {
  auction: AuctionItem;
  bid: BidItem;
  customerKey?: string;
}): Promise<{ data: PreparePaymentResult | null; error: string | null }> {
  try {
    const amount = advertiserPayableAmount(input.bid.bidAmount);
    if (amount < 100) {
      return { data: null, error: '결제 금액이 올바르지 않습니다.' };
    }

    const response = await fetch('/api/payments/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auctionId: input.auction.id,
        bidId: input.bid.id,
        amount,
        orderName: input.auction.title.trim() || '역경매 낙찰',
        customerKey: input.customerKey,
      }),
    });

    const payload = (await response.json().catch(() => null)) as
      | (PreparePaymentResult & { error?: string })
      | null;

    if (!response.ok || !payload?.orderId) {
      return {
        data: null,
        error: payload?.error || '결제를 준비하지 못했습니다. 다시 시도해 주세요.',
      };
    }

    return { data: payload, error: null };
  } catch (error) {
    console.warn('[SponsorAuction] 결제 준비 요청 중 예외가 발생했습니다.', error);
    return { data: null, error: '결제를 준비하지 못했습니다. 다시 시도해 주세요.' };
  }
}
