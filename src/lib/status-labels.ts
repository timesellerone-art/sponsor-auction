import type { AuctionStatus, BidStatus } from '@/types/auction';

export const AUCTION_STATUS_LABEL: Record<AuctionStatus, string> = {
  active: '진행중',
  matched: '매칭됨',
  completed: '결제 완료',
  cancelled: '취소',
  closed: '매칭 완료',
};

export const BID_STATUS_LABEL: Record<BidStatus, string> = {
  pending: '제안 대기',
  selected: '낙찰/결제 완료',
};

export function auctionStatusLabel(status: AuctionStatus | undefined) {
  if (!status) {
    return AUCTION_STATUS_LABEL.active;
  }
  return AUCTION_STATUS_LABEL[status] ?? status;
}

export function bidStatusLabel(status: BidStatus | undefined, paid = false) {
  if (paid || status === 'selected') {
    return BID_STATUS_LABEL.selected;
  }
  return BID_STATUS_LABEL.pending;
}
