import { isPlatformType } from '@/lib/platforms';
import type { AuctionItem, AuctionStatus, BidItem } from '@/types/auction';
import type { DealKind } from '@/types/dashboard';
import {
  isTimeSlotOpen,
  type TimeSlotBidItem,
  type TimeSlotItem,
} from '@/types/timeslot';

export type { DealKind };

export function timeSlotAuctionStatus(slot: TimeSlotItem): AuctionStatus {
  if (slot.status === 'awarded' || slot.winnerBidId) {
    return 'closed';
  }
  if (slot.status === 'closed' || !isTimeSlotOpen(slot)) {
    return 'cancelled';
  }
  return 'active';
}

export function timeSlotToAuctionItem(
  slot: TimeSlotItem,
  author?: { authorId?: string | null; authorName?: string },
): AuctionItem {
  const platform = slot.platform;
  return {
    id: slot.id,
    title: slot.title,
    platform: isPlatformType(platform) ? platform : 'other',
    budget: slot.startingPrice,
    description: slot.description,
    status: timeSlotAuctionStatus(slot),
    isBlind: false,
    authorId: author?.authorId ?? slot.creatorId,
    authorName: author?.authorName?.trim() || slot.creatorName || '미상',
    winnerBidId: slot.winnerBidId,
    deadline: slot.deadline,
    createdAt: slot.createdAt,
    bidsCount: slot.bidsCount,
    leadingBidAmount: slot.currentHighestBid,
    highestBidAmount: slot.currentHighestBid,
    category: 'creator_product',
  };
}

export function timeSlotBidToBidItem(
  bid: TimeSlotBidItem,
  slot: TimeSlotItem,
  options?: { proposerName?: string },
): BidItem {
  const selected = Boolean(slot.winnerBidId && slot.winnerBidId === bid.id);
  return {
    id: bid.id,
    auctionId: slot.id,
    creatorId: slot.creatorId,
    creatorName: options?.proposerName?.trim() || slot.creatorName || '이름 없음',
    creatorChannelUrl: '',
    bidAmount: bid.bidAmount,
    proposalText: bid.message,
    status: selected ? 'selected' : 'pending',
    createdAt: bid.createdAt,
  };
}

export function dealDetailHref(kind: DealKind | undefined, id: string) {
  return kind === 'timeslot' ? `/timeslots/${id}` : `/auctions/${id}`;
}
