import type { PayoutItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';

export type DealKind = 'campaign' | 'timeslot';

export type PaymentRecord = {
  orderId: string;
  auctionId: string;
  bidId: string;
  amount: number;
  status: string;
  orderName: string;
  confirmedAt: string | null;
};

export type AdvertiserDeal = {
  auction: AuctionItem;
  bid: BidItem | null;
  bids: BidItem[];
  payment: PaymentRecord | null;
  kind?: DealKind;
};

export type CreatorPayoutStatus = 'none' | 'pending' | 'hold' | 'paid';

export type CreatorDeal = {
  bid: BidItem;
  auction: AuctionItem | null;
  payment: PaymentRecord | null;
  payout: PayoutItem | null;
  payoutStatus: CreatorPayoutStatus;
  kind?: DealKind;
};
