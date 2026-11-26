import type { PlatformType } from '@/types/auction';

export type TimeSlotStatus = 'open' | 'closed' | 'awarded';

export type TimeSlotItem = {
  id: string;
  creatorId: string | null;
  creatorName: string;
  title: string;
  platform: PlatformType;
  description: string;
  expectedViews: number;
  startingPrice: number;
  currentHighestBid: number;
  bidsCount: number;
  slotStart: string;
  slotEnd: string;
  deadline: string;
  status: TimeSlotStatus;
  winnerBidId: string | null;
  isBlind?: boolean;
  paidAt?: string | null;
  deliveryUrl?: string | null;
  deliveredAt?: string | null;
  purchaseConfirmedAt?: string | null;
  createdAt: string;
  creatorRating?: number;
  creatorCompletionRate?: number;
};

export type TimeSlotBidItem = {
  id: string;
  timeSlotId: string;
  advertiserId: string | null;
  advertiserName: string;
  bidAmount: number;
  message: string;
  createdAt: string;
  isLeading?: boolean;
};

export type CreateTimeSlotInput = {
  creatorId?: string | null;
  creatorName?: string;
  title: string;
  platform: PlatformType;
  description: string;
  expectedViews: number;
  startingPrice: number;
  slotStart: string;
  slotEnd: string;
  deadline: string;
};

export type PlaceTimeSlotBidInput = {
  timeSlotId: string;
  advertiserId?: string | null;
  advertiserName?: string;
  bidAmount: number;
  message: string;
};

export function isTimeSlotOpen(slot: Pick<TimeSlotItem, 'status' | 'deadline' | 'winnerBidId'>) {
  if (slot.status !== 'open' || slot.winnerBidId) {
    return false;
  }
  const end = Date.parse(slot.deadline);
  return Number.isFinite(end) ? end > Date.now() : true;
}

export function isTimeslotAwaitingPayment(
  slot: Pick<TimeSlotItem, 'winnerBidId' | 'paidAt' | 'status'>,
) {
  return Boolean(slot.winnerBidId) && !slot.paidAt && slot.status === 'awarded';
}

export function isTimeslotEscrowed(slot: Pick<TimeSlotItem, 'winnerBidId' | 'paidAt'>) {
  return Boolean(slot.winnerBidId && slot.paidAt);
}
