export const TIMESLOT_BID_INCREMENT = 10_000;

export function expiredAuctionStatus(
  status: string | undefined,
  deadline: string | undefined,
  winnerBidId?: string | null,
  now = Date.now(),
) {
  if (status === 'active' && !winnerBidId && isDeadlinePassed(deadline, now)) {
    return 'closed';
  }
  return status;
}

export function isDeadlinePassed(deadline: string | undefined, now = Date.now()) {
  if (!deadline) {
    return false;
  }
  const end = Date.parse(deadline);
  return Number.isFinite(end) && end <= now;
}

export function remainingDeadlineMs(deadline: string | undefined, now = Date.now()) {
  if (!deadline) {
    return null;
  }
  const end = Date.parse(deadline);
  if (!Number.isFinite(end)) {
    return null;
  }
  return Math.max(0, end - now);
}

export function computeBidEngineStats(amounts: number[]) {
  const valid = amounts.filter((value) => Number.isFinite(value) && value > 0);
  if (valid.length === 0) {
    return { leadingBidAmount: 0, highestBidAmount: 0, bidsCount: 0 };
  }
  return {
    leadingBidAmount: Math.min(...valid),
    highestBidAmount: Math.max(...valid),
    bidsCount: valid.length,
  };
}

export function nextInventoryMinBid(startingPrice: number, currentHighestBid: number) {
  const start = Number.isFinite(startingPrice) ? startingPrice : 0;
  const highest = Number.isFinite(currentHighestBid) ? currentHighestBid : 0;
  if (highest <= 0) {
    return start;
  }
  return highest + TIMESLOT_BID_INCREMENT;
}

export function formatCountdown(ms: number | null) {
  if (ms == null) {
    return '마감 미정';
  }
  if (ms <= 0) {
    return '마감됨';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) {
    return `${days}일 ${hours}시간 ${minutes}분`;
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
