import type { PayoutItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';

export type AdminBidLifecycle = 'pending' | 'awarded' | 'paid' | 'rejected';

export function payoutMatchesBid(
  payout: PayoutItem,
  bid: BidItem,
  auction?: AuctionItem,
) {
  if (payout.status !== 'paid') {
    return false;
  }
  if (payout.bidId && payout.bidId === bid.id) {
    return true;
  }
  if (payout.creatorId && bid.creatorId && payout.creatorId === bid.creatorId && payout.auctionId === bid.auctionId) {
    return true;
  }
  if (payout.auctionId && payout.auctionId === bid.auctionId && bid.status === 'selected') {
    return true;
  }
  if (
    payout.creatorName &&
    bid.creatorName &&
    payout.creatorName === bid.creatorName &&
    ((payout.auctionId && payout.auctionId === bid.auctionId) ||
      (auction?.title && payout.auctionTitle === auction.title))
  ) {
    return true;
  }
  return false;
}

export function resolveAdminBidStatus(
  bid: BidItem,
  auction: AuctionItem | undefined,
  payouts: PayoutItem[],
): AdminBidLifecycle {
  const paid = payouts.some((item) => payoutMatchesBid(item, bid, auction));
  if (paid) {
    return 'paid';
  }

  if (bid.status === 'selected') {
    return 'awarded';
  }

  const auctionStatus = auction?.status;
  if (
    auctionStatus === 'closed' ||
    auctionStatus === 'cancelled' ||
    auctionStatus === 'matched' ||
    auctionStatus === 'completed'
  ) {
    return 'rejected';
  }

  return 'pending';
}

export const ADMIN_BID_STATUS_LABEL: Record<AdminBidLifecycle, string> = {
  pending: '제안/대기',
  awarded: '낙찰/결제완료',
  paid: '낙찰 / 지급 완료',
  rejected: '탈락/취소',
};

export const ADMIN_BID_STATUS_CLASS: Record<AdminBidLifecycle, string> = {
  pending: 'bg-amber-50 text-amber-800',
  awarded: 'bg-sky-50 text-sky-800',
  paid: 'bg-emerald-50 text-emerald-800',
  rejected: 'bg-zinc-100 text-zinc-600',
};
