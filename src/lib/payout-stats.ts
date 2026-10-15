import {
  advertiserPayableAmount,
  bidAmountFromCreatorPayout,
  platformFeeFromAmount,
} from '@/lib/fees';
import type { PayoutItem, PayoutPeriodFilter } from '@/types/admin';

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function payoutTime(item: PayoutItem) {
  const raw = item.paidAt || item.requestedAt;
  const time = Date.parse(raw);
  return Number.isNaN(time) ? 0 : time;
}

export function enrichPayout(item: PayoutItem): PayoutItem {
  const bidAmount =
    item.bidAmount && item.bidAmount > 0
      ? item.bidAmount
      : bidAmountFromCreatorPayout(item.amount);
  return {
    ...item,
    bidAmount,
    platformFee: item.platformFee ?? platformFeeFromAmount(bidAmount),
    advertiserCharge: item.advertiserCharge ?? advertiserPayableAmount(bidAmount),
  };
}

export function filterPayoutsByPeriod(
  payouts: PayoutItem[],
  period: PayoutPeriodFilter,
  rangeFrom = '',
  rangeTo = '',
) {
  if (period === 'all') {
    return payouts;
  }

  const now = new Date();
  const todayStart = startOfLocalDay(now);
  let from = 0;
  let to = Date.now() + 24 * 60 * 60 * 1000;

  if (period === 'today') {
    from = todayStart;
    to = todayStart + 24 * 60 * 60 * 1000;
  } else if (period === '7d') {
    from = todayStart - 6 * 24 * 60 * 60 * 1000;
  } else if (period === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  } else {
    if (rangeFrom) {
      from = startOfLocalDay(new Date(`${rangeFrom}T00:00:00`));
    }
    if (rangeTo) {
      to = startOfLocalDay(new Date(`${rangeTo}T00:00:00`)) + 24 * 60 * 60 * 1000;
    }
  }

  return payouts.filter((item) => {
    const time = payoutTime(item);
    return time >= from && time < to;
  });
}

export function summarizePayouts(payouts: PayoutItem[]) {
  return payouts.reduce(
    (acc, item) => {
      const row = enrichPayout(item);
      acc.volume += row.advertiserCharge ?? 0;
      acc.fees += row.platformFee ?? 0;
      if (row.status === 'paid') {
        acc.paid += row.amount;
      } else {
        acc.pending += row.amount;
      }
      return acc;
    },
    { volume: 0, fees: 0, paid: 0, pending: 0 },
  );
}
