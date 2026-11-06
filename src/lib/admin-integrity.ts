import {
  advertiserPayableAmount,
  bidAmountFromCreatorPayout,
  creatorCombinedFeeAmount,
  floorToTenWon,
  platformNetFeeFromBid,
} from '@/lib/fees';
import { calculateCreatorPayout } from '@/lib/payments/payout';
import { describeSettlementTax } from '@/lib/tax';
import type { PayoutItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';

export const DELETED_CAMPAIGN_LABEL = '(삭제된 캠페인)';

type AuctionRef = Pick<AuctionItem, 'id' | 'title'> & { status?: string | null };
type BidRef = Pick<BidItem, 'id' | 'auctionId' | 'bidAmount' | 'status'>;

function auctionById(auctions: AuctionRef[]) {
  return new Map(auctions.map((item) => [item.id, item]));
}

function bidAmountForPayout(payout: PayoutItem, bids: BidRef[]) {
  if (payout.bidAmount && payout.bidAmount > 0) {
    return payout.bidAmount;
  }
  if (payout.bidId) {
    const matched = bids.find((item) => item.id === payout.bidId);
    if (matched && matched.bidAmount > 0) {
      return matched.bidAmount;
    }
  }
  if (payout.auctionId) {
    const selected = bids.find(
      (item) => item.auctionId === payout.auctionId && item.status === 'selected',
    );
    if (selected && selected.bidAmount > 0) {
      return selected.bidAmount;
    }
  }
  return bidAmountFromCreatorPayout(payout.amount);
}

export function campaignTitleForAdmin(
  auction: AuctionRef | null | undefined,
  campaignId?: string | null,
  fallbackTitle?: string | null,
) {
  if (auction?.title?.trim()) {
    return auction.title.trim();
  }
  if (campaignId && !auction) {
    return DELETED_CAMPAIGN_LABEL;
  }
  const fallback = (fallbackTitle ?? '').trim();
  return fallback || DELETED_CAMPAIGN_LABEL;
}

export function enrichPayoutAmounts(item: PayoutItem, bids: BidRef[] = []): PayoutItem {
  const bidAmount = bidAmountForPayout(item, bids);
  const tax = describeSettlementTax(bidAmount);
  const netPayoutAmount = floorToTenWon(calculateCreatorPayout(bidAmount));
  return {
    ...item,
    bidAmount,
    platformFee: floorToTenWon(creatorCombinedFeeAmount(bidAmount)),
    platformNetFee: platformNetFeeFromBid(bidAmount),
    advertiserCharge: floorToTenWon(advertiserPayableAmount(bidAmount)),
    supplyAmount: floorToTenWon(tax.advertiser.supplyAmount),
    vatAmount: floorToTenWon(tax.advertiser.vatAmount),
    withholdingAmount: floorToTenWon(tax.creator.withholdingAmount),
    netPayoutAmount,
    amount:
      item.status === 'paid' || item.status === 'cancelled'
        ? item.amount
        : netPayoutAmount || item.amount,
  };
}

export function applyAdminPayoutIntegrity(
  payouts: PayoutItem[],
  auctions: AuctionRef[] = [],
  bids: BidRef[] = [],
): PayoutItem[] {
  const auctionsMap = auctionById(auctions);
  return payouts.map((item) => {
    const enriched = enrichPayoutAmounts(item, bids);
    const auction = item.auctionId ? auctionsMap.get(item.auctionId) : undefined;
    const cancelled = auction?.status === 'cancelled';
    const missingCampaign = Boolean(item.auctionId) && !auction;

    return {
      ...enriched,
      auctionTitle: missingCampaign
        ? DELETED_CAMPAIGN_LABEL
        : campaignTitleForAdmin(auction, item.auctionId, item.auctionTitle),
      amount: cancelled
        ? enriched.netPayoutAmount || enriched.amount
        : enriched.amount,
      status: cancelled ? 'cancelled' : enriched.status,
    };
  });
}
