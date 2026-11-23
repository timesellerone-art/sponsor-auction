import {
  creatorTaxKind,
  isBusinessVerificationStatus,
  type CreatorTaxKind,
} from '@/lib/business-registration';
import { bidAmountFromCreatorPayout } from '@/lib/fees';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import type { PayoutItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';

export const DELETED_CAMPAIGN_LABEL = '(삭제된 캠페인)';

type AuctionRef = Pick<AuctionItem, 'id' | 'title'> & { status?: string | null };
type BidRef = Pick<BidItem, 'id' | 'auctionId' | 'bidAmount' | 'status'>;
type ProfileTaxRef = {
  id: string;
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

function taxKindForPayout(item: PayoutItem, profile?: ProfileTaxRef | null): CreatorTaxKind {
  // 검증 상태 기준으로 매번 재산정한다. (번호만 있는 무증빙을 사업자로 굳히지 않음)
  return creatorTaxKind({
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
        : amounts.finalSettlement || item.amount,
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
