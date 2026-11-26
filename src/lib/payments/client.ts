import { advertiserTotalCharge } from '@/lib/fees';
import { authRequestInit } from '@/lib/auth-request';
import { getTossClientKey } from '@/lib/payments/env';
import { publicSupabasePayload } from '@/lib/supabase/env';
import type { PreparePaymentResult } from '@/types/payment';
import type { AuctionItem, BidItem } from '@/types/auction';
import type { DealKind } from '@/types/dashboard';

const CHECKOUT_STORAGE_KEY = 'sa-pay-checkout';

export type CheckoutContext = {
  orderId: string;
  auctionId: string;
  bidId: string;
  amount: number;
  kind?: DealKind;
};

export function rememberCheckoutContext(context: CheckoutContext) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const payload = JSON.stringify(context);
    window.sessionStorage.setItem(CHECKOUT_STORAGE_KEY, payload);
    window.sessionStorage.setItem(`${CHECKOUT_STORAGE_KEY}:${context.orderId}`, payload);
  } catch {
    // ignore quota / private mode
  }
}

export function readCheckoutContext(orderId?: string): CheckoutContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = orderId
      ? window.sessionStorage.getItem(`${CHECKOUT_STORAGE_KEY}:${orderId}`) ||
        window.sessionStorage.getItem(CHECKOUT_STORAGE_KEY)
      : window.sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<CheckoutContext>;
    if (
      typeof parsed.orderId !== 'string' ||
      typeof parsed.auctionId !== 'string' ||
      typeof parsed.bidId !== 'string' ||
      typeof parsed.amount !== 'number'
    ) {
      return null;
    }
    if (orderId && parsed.orderId !== orderId) {
      return null;
    }
    return {
      orderId: parsed.orderId,
      auctionId: parsed.auctionId,
      bidId: parsed.bidId,
      amount: parsed.amount,
      kind: parsed.kind === 'timeslot' ? 'timeslot' : parsed.kind === 'campaign' ? 'campaign' : undefined,
    };
  } catch {
    return null;
  }
}

export function recoverAuctionHref(auctionId?: string | null, kind?: DealKind | null) {
  const id = auctionId?.trim();
  if (!id) {
    return '/my';
  }
  return kind === 'timeslot' ? `/timeslots/${id}` : `/auctions/${id}`;
}

export async function prepareAwardPayment(input: {
  auction: AuctionItem;
  bid: BidItem;
  customerKey?: string;
  kind?: DealKind;
}): Promise<{ data: PreparePaymentResult | null; error: string | null }> {
  try {
    const amount = advertiserTotalCharge(input.bid.bidAmount);
    if (amount < 100) {
      return { data: null, error: '결제 금액이 올바르지 않습니다.' };
    }

    const response = await fetch(
      '/api/payments/prepare',
      await authRequestInit({
        method: 'POST',
        body: JSON.stringify({
          auctionId: input.auction.id,
          bidId: input.bid.id,
          amount,
          bidAmount: input.bid.bidAmount,
          orderName:
            input.auction.title.trim() ||
            (input.kind === 'timeslot' ? '크리에이터 상품 결제' : '캠페인 매칭'),
          customerKey: input.customerKey,
          ...publicSupabasePayload(),
        }),
      }),
    );

    const payload = (await response.json().catch(() => null)) as
      | (PreparePaymentResult & { error?: string })
      | null;

    if (!response.ok || !payload?.orderId) {
      return {
        data: null,
        error: payload?.error || '결제를 준비하지 못했습니다. 다시 시도해 주세요.',
      };
    }

    const clientKey = payload.clientKey?.trim() || getTossClientKey() || null;
    return {
      data: {
        ...payload,
        auctionId: payload.auctionId || input.auction.id,
        bidId: payload.bidId || input.bid.id,
        bidAmount: payload.bidAmount || input.bid.bidAmount,
        clientKey,
        demo: !clientKey,
        kind: input.kind,
      },
      error: null,
    };
  } catch (error) {
    console.warn('[SponsorAuction] 결제 준비 요청 중 예외가 발생했습니다.', error);
    return { data: null, error: '결제를 준비하지 못했습니다. 다시 시도해 주세요.' };
  }
}
