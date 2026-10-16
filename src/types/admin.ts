export type ProfileRole = 'advertiser' | 'creator' | 'admin';

export type ProfileStatus = 'active' | 'suspended';

export type PayoutStatus = 'pending' | 'paid';

export interface ProfileItem {
  id: string;
  name: string;
  email: string;
  role: ProfileRole;
  status: ProfileStatus;
  createdAt: string;
}

export interface PayoutItem {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorEmail: string;
  amount: number;
  status: PayoutStatus;
  auctionTitle: string;
  requestedAt: string;
  paidAt?: string | null;
  paymentOrderId?: string | null;
  auctionId?: string | null;
  bidId?: string | null;
  bidAmount?: number;
  platformFee?: number;
  advertiserCharge?: number;
  adminMemo?: string;
  bankAccount?: string;
  supplyAmount?: number;
  vatAmount?: number;
  withholdingAmount?: number;
  netPayoutAmount?: number;
}

export type PayoutPeriodFilter = 'all' | 'today' | '7d' | 'month' | 'range';

export type AuctionAdminFilter = 'all' | 'active' | 'awarded' | 'ended';

export type ProfileAdminFilter = 'all' | 'active' | 'suspended';

export type PayoutAdminFilter = 'all' | 'pending' | 'paid';

export type BidAdminFilter = 'all' | 'pending' | 'awarded' | 'paid' | 'rejected';
