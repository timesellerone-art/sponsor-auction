export type ProfileRole = 'advertiser' | 'creator' | 'admin';

export type ProfileStatus = 'active' | 'suspended';

export type PayoutStatus = 'pending' | 'paid' | 'cancelled' | 'hold';

export type BusinessVerificationStatus =
  | 'unregistered'
  | 'verified'
  | 'closed'
  | 'review_required'
  | 'rejected';

export interface ProfileItem {
  id: string;
  name: string;
  email: string;
  role: ProfileRole | null;
  roles?: ProfileRole[];
  status: ProfileStatus;
  createdAt: string;
  rating?: number;
  completionRate?: number;
  penaltyCount?: number;
  youtubeVerified?: boolean;
  businessRegistrationNumber?: string;
  businessVerificationStatus?: BusinessVerificationStatus;
  businessStatusDetail?: string;
  businessReviewNote?: string;
  businessRepresentativeName?: string;
  businessOpenedOn?: string;
  businessCompanyName?: string;
  businessAddress?: string;
  businessContact?: string;
  businessCertificateName?: string;
  hasBusinessCertificate?: boolean;
  phone?: string | null;
  settlementType?: 'individual' | 'business';
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
  /** 광고주 결제 합계 = (낙찰 + 15%) + 부가세 10% */
  advertiserCharge?: number;
  adminMemo?: string;
  bankAccount?: string;
  bankName?: string;
  accountNumber?: string;
  accountHolder?: string;
  settlementDueAt?: string | null;
  supplyAmount?: number;
  vatAmount?: number;
  withholdingAmount?: number;
  netPayoutAmount?: number;
  /** 원천징수 반영 후 이체액(10원 절사) */
  transferAmount?: number;
  taxKind?: 'individual' | 'business';
  businessRegistrationNumber?: string;
  businessVerificationStatus?: BusinessVerificationStatus;
  platformNetFee?: number;
  dealKind?: 'campaign' | 'timeslot';
}

export type PayoutPeriodFilter = 'all' | 'today' | '7d' | 'month' | 'range';

export type AuctionAdminFilter = 'all' | 'active' | 'awarded' | 'ended';

export type ProfileAdminFilter =
  | 'all'
  | 'active'
  | 'suspended'
  | 'verified'
  | 'unverified'
  | 'creator';

export type PayoutAdminFilter = 'all' | 'pending' | 'paid' | 'cancelled' | 'hold';

export type BidAdminFilter = 'all' | 'pending' | 'awarded' | 'paid' | 'rejected';

export type TimeslotAdminFilter =
  | 'all'
  | 'open'
  | 'awaiting_payment'
  | 'awarded'
  | 'delivered'
  | 'confirmed'
  | 'closed'
  | 'blind';

export type PayoutDealKindFilter = 'all' | 'campaign' | 'timeslot';
