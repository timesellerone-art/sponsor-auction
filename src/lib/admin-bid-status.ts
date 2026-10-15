import type { PayoutItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';

export type AdminBidLifecycle =
  | 'bidding'
  | 'awaiting_payment'
  | 'settled'
  | 'closed_unselected';

export function resolveAdminBidStatus(
  bid: BidItem,
  auction: AuctionItem | undefined,
  payouts: PayoutItem[],
): AdminBidLifecycle {
  const paid = payouts.some(
    (item) =>
      item.status === 'paid' &&
      ((item.bidId && item.bidId === bid.id) ||
        (item.auctionId && item.auctionId === bid.auctionId)),
  );
  const auctionStatus = auction?.status;

  if (paid || auctionStatus === 'completed') {
    if (bid.status === 'selected' || paid) {
      return 'settled';
    }
    return 'closed_unselected';
  }

  if (bid.status === 'selected') {
    return 'awaiting_payment';
  }

  if (
    auctionStatus === 'closed' ||
    auctionStatus === 'cancelled' ||
    auctionStatus === 'matched'
  ) {
    return 'closed_unselected';
  }

  return 'bidding';
}

export const ADMIN_BID_STATUS_LABEL: Record<AdminBidLifecycle, string> = {
  bidding: '입찰 중',
  awaiting_payment: '낙찰 / 결제 대기',
  settled: '결제 및 정산 완료',
  closed_unselected: '마감 / 미선택',
};

export const ADMIN_BID_STATUS_CLASS: Record<AdminBidLifecycle, string> = {
  bidding: 'bg-amber-50 text-amber-800',
  awaiting_payment: 'bg-sky-50 text-sky-800',
  settled: 'bg-emerald-50 text-emerald-800',
  closed_unselected: 'bg-zinc-100 text-zinc-600',
};
