import { isTimeSlotOpen, isTimeslotAwaitingPayment, type TimeSlotItem } from '@/types/timeslot';
import type { TimeslotAdminFilter } from '@/types/admin';

export type TimeslotAdminLifecycle =
  | 'open'
  | 'awaiting_payment'
  | 'awarded'
  | 'delivered'
  | 'confirmed'
  | 'closed';

export const TIMESLOT_ADMIN_STATUS_LABEL: Record<TimeslotAdminLifecycle, string> = {
  open: '진행 중',
  awaiting_payment: '결제 대기',
  awarded: '진행 중(예치)',
  delivered: '납품',
  confirmed: '구매확정',
  closed: '취소',
};

export const TIMESLOT_ADMIN_STATUS_CLASS: Record<TimeslotAdminLifecycle, string> = {
  open: 'bg-clink-peach text-clink-accent',
  awaiting_payment: 'bg-amber-50 text-amber-800',
  awarded: 'bg-amber-50 text-amber-800',
  delivered: 'bg-sky-50 text-sky-800',
  confirmed: 'bg-clink-peach text-clink',
  closed: 'bg-zinc-100 text-zinc-600',
};

export function timeslotAdminLifecycle(slot: TimeSlotItem): TimeslotAdminLifecycle {
  if (slot.purchaseConfirmedAt) {
    return 'confirmed';
  }
  if (slot.deliveredAt || slot.deliveryUrl) {
    return 'delivered';
  }
  if (isTimeslotAwaitingPayment(slot)) {
    return 'awaiting_payment';
  }
  if (slot.status === 'awarded' || slot.winnerBidId) {
    return 'awarded';
  }
  if (slot.status === 'closed' || !isTimeSlotOpen(slot)) {
    return 'closed';
  }
  return 'open';
}

export function timeslotAdminStatusText(slot: TimeSlotItem) {
  const label = TIMESLOT_ADMIN_STATUS_LABEL[timeslotAdminLifecycle(slot)];
  return slot.isBlind ? `숨김 · ${label}` : label;
}

export function canForceCloseTimeslot(slot: TimeSlotItem) {
  return timeslotAdminLifecycle(slot) === 'open';
}

export function matchesTimeslotAdminFilter(slot: TimeSlotItem, filter: TimeslotAdminFilter) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'blind') {
    return Boolean(slot.isBlind);
  }
  return timeslotAdminLifecycle(slot) === filter;
}
