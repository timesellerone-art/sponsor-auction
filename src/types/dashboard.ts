import type { AuctionItem, BidItem } from '@/types/auction';

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
};

export type CreatorDeal = {
  bid: BidItem;
  auction: AuctionItem | null;
  payment: PaymentRecord | null;
};
