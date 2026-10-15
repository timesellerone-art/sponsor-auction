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
}

export type PayoutPeriodFilter = 'all' | 'today' | '7d' | 'month' | 'range';

export type AuctionAdminFilter = 'all' | 'active' | 'closed' | 'blind';
