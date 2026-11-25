import type { AuctionStatus, BidStatus } from '@/types/auction';
import type { CreatorPayoutStatus } from '@/types/dashboard';

export const AUCTION_STATUS_LABEL: Record<AuctionStatus, string> = {
  active: '진행중',
  matched: '매칭됨',
  completed: '결제 완료',
  cancelled: '취소',
  closed: '낙찰 완료',
};

export const BID_STATUS_LABEL: Record<BidStatus, string> = {
  pending: '제안 대기',
  selected: '낙찰 완료',
};

export const CREATOR_PAYOUT_STATUS_LABEL: Record<CreatorPayoutStatus, string> = {
  none: '제안 대기',
  pending: '정산 예정',
  hold: '정산 보류',
  paid: '지급 완료',
};

export function auctionStatusLabel(status: AuctionStatus | undefined) {
  if (!status) {
    return AUCTION_STATUS_LABEL.active;
  }
  return AUCTION_STATUS_LABEL[status] ?? status;
}

export function bidStatusLabel(status: BidStatus | undefined, paid = false) {
  if (paid) {
    return CREATOR_PAYOUT_STATUS_LABEL.paid;
  }
  if (status === 'selected') {
    return BID_STATUS_LABEL.selected;
  }
  return BID_STATUS_LABEL.pending;
}

export function creatorPayoutStatusLabel(
  payoutStatus: CreatorPayoutStatus | undefined,
  awarded = false,
) {
  if (payoutStatus === 'paid') {
    return CREATOR_PAYOUT_STATUS_LABEL.paid;
  }
  if (payoutStatus === 'hold') {
    return CREATOR_PAYOUT_STATUS_LABEL.hold;
  }
  if (payoutStatus === 'pending' || awarded) {
    return CREATOR_PAYOUT_STATUS_LABEL.pending;
  }
  return CREATOR_PAYOUT_STATUS_LABEL.none;
}
