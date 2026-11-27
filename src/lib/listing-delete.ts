import { isTimeSlotOpen, type TimeSlotItem } from '@/types/timeslot';
import type { AuctionItem } from '@/types/auction';

export const LISTING_DELETE_CONFIRM =
  '정말 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.';

export const LISTING_DELETE_OWNER_BLOCKED =
  '선정·결제·납품이 진행된 항목은 삭제할 수 없습니다. 모집 중(선정·결제 전)인 게시물만 삭제할 수 있습니다.';

export const LISTING_DELETE_FORBIDDEN = '본인이 등록한 게시물만 삭제할 수 있습니다.';
export const LISTING_DELETE_NOT_FOUND = '게시물을 찾을 수 없습니다.';
export const LISTING_DELETE_FAIL = '삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.';

export function canOwnerDeleteCampaign(
  auction: Pick<AuctionItem, 'status' | 'winnerBidId'> | null | undefined,
) {
  if (!auction) {
    return false;
  }
  return auction.status === 'active' && !auction.winnerBidId;
}

export function canOwnerDeleteTimeslot(
  slot:
    | (Pick<TimeSlotItem, 'status' | 'winnerBidId' | 'deadline'> &
        Partial<Pick<TimeSlotItem, 'paidAt' | 'deliveredAt' | 'purchaseConfirmedAt'>>)
    | null
    | undefined,
) {
  if (!slot) {
    return false;
  }
  return (
    isTimeSlotOpen(slot) &&
    !slot.winnerBidId &&
    !slot.paidAt &&
    !slot.deliveredAt &&
    !slot.purchaseConfirmedAt
  );
}
