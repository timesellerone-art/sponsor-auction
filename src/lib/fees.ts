export const ADVERTISER_FEE_RATE = 0.1;
export const CREATOR_FEE_RATE = 0.15;

function asWon(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round(value);
}

export function platformFeeFromAmount(amount: number) {
  const won = asWon(amount);
  if (won <= 0) {
    return 0;
  }

  return Math.round(won * ADVERTISER_FEE_RATE) + Math.round(won * CREATOR_FEE_RATE);
}

export function advertiserPayableAmount(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }

  return won + Math.round(won * ADVERTISER_FEE_RATE);
}

export function creatorPayoutAmount(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }

  return Math.max(0, won - Math.round(won * CREATOR_FEE_RATE));
}

export function bidAmountFromCreatorPayout(payoutAmount: number) {
  if (typeof payoutAmount !== 'number' || !Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    return 0;
  }

  return Math.round(payoutAmount / (1 - CREATOR_FEE_RATE));
}

export function creatorPayoutFromCharge(chargeAmount: number) {
  if (typeof chargeAmount !== 'number' || !Number.isFinite(chargeAmount) || chargeAmount <= 0) {
    return 0;
  }

  const bidAmount = Math.round(chargeAmount / (1 + ADVERTISER_FEE_RATE));
  return creatorPayoutAmount(bidAmount);
}
