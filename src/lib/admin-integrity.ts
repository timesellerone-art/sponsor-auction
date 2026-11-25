import {
  creatorTaxKind,
  isBusinessVerificationStatus,
  type CreatorTaxKind,
} from '@/lib/business-registration';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import type { PayoutItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';

export const DELETED_CAMPAIGN_LABEL = '(삭제된 캠페인)';

type AuctionRef = Pick<AuctionItem, 'id' | 'title'> & { status?: string | null };
type BidRef = Pick<BidItem, 'id' | 'auctionId' | 'bidAmount' | 'status'>;
type ProfileTaxRef = {
  id: string;
  settlementType?: string | null;
  businessRegistrationNumber?: string | null;
  businessVerificationStatus?: string | null;
};

function auctionById(auctions: AuctionRef[]) {
  return new Map(auctions.map((item) => [item.id, item]));
}

function profileById(profiles: ProfileTaxRef[]) {
  return new Map(profiles.map((item) => [item.id, item]));
}

function bidAmountForPayout(payout: PayoutItem, bids: BidRef[]) {
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
  if (payout.bidAmount && payout.bidAmount > 0) {
    return payout.bidAmount;
  }
  return 0;
}

function taxKindForPayout(item: PayoutItem, profile?: ProfileTaxRef | null): CreatorTaxKind {
  return creatorTaxKind({
    settlementType: profile?.settlementType ?? item.taxKind,
    businessVerificationStatus:
      profile?.businessVerificationStatus ?? item.businessVerificationStatus,
    businessRegistrationNumber:
      profile?.businessRegistrationNumber ?? item.businessRegistrationNumber,
  });
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

export function enrichPayoutAmounts(
  item: PayoutItem,
  bids: BidRef[] = [],
  profiles: ProfileTaxRef[] = [],
): PayoutItem {
  const bidAmount = bidAmountForPayout(item, bids);
  const profile = item.creatorId ? profileById(profiles).get(item.creatorId) : undefined;
  const taxKind = taxKindForPayout(item, profile);
  const amounts = describeSettlementAmounts(bidAmount, taxKind);
  const statusRaw =
    profile?.businessVerificationStatus ?? item.businessVerificationStatus ?? '';
  return {
    ...item,
    bidAmount: amounts.bidAmount,
    taxKind: amounts.taxKind,
    businessRegistrationNumber:
      profile?.businessRegistrationNumber ?? item.businessRegistrationNumber,
    businessVerificationStatus: isBusinessVerificationStatus(statusRaw)
      ? statusRaw
      : item.businessVerificationStatus,
    platformFee: amounts.creatorFee,
    platformNetFee: amounts.platformNetFee,
    advertiserCharge: amounts.advertiserCharge,
    supplyAmount: amounts.supplyAmount,
    vatAmount: amounts.vatAmount,
    withholdingAmount: amounts.withholdingAmount,
    netPayoutAmount: amounts.finalSettlement,
    transferAmount: amounts.transferAmount,
    amount:
      item.status === 'paid' || item.status === 'cancelled'
        ? item.amount
        : amounts.transferAmount || item.amount,
  };
}

export function applyAdminPayoutIntegrity(
  payouts: PayoutItem[],
  auctions: AuctionRef[] = [],
  bids: BidRef[] = [],
  profiles: ProfileTaxRef[] = [],
): PayoutItem[] {
  const auctionsMap = auctionById(auctions);
  return payouts.map((item) => {
    const enriched = enrichPayoutAmounts(item, bids, profiles);
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
