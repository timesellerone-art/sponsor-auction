import {
  CREATOR_COMBINED_DEDUCTION_RATE,
  bidAmountFromCreatorPayout,
  calculateCreatorPayout,
  creatorCombinedFeeAmount,
} from '@/lib/payments/payout';

export const ADVERTISER_FEE_RATE = 0.1;
export const CREATOR_FEE_RATE = CREATOR_COMBINED_DEDUCTION_RATE;

export { bidAmountFromCreatorPayout, creatorCombinedFeeAmount };

function asWon(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round(value);
}

export function advertiserFeeFromBid(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }

  return Math.round(won * ADVERTISER_FEE_RATE);
}

export function platformFeeFromAmount(amount: number) {
  const won = asWon(amount);
  if (won <= 0) {
    return 0;
  }

  return advertiserFeeFromBid(won) + creatorCombinedFeeAmount(won);
}

export function advertiserPayableAmount(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }

  return won + advertiserFeeFromBid(won);
}

export function creatorPayoutAmount(bidAmount: number) {
  return calculateCreatorPayout(bidAmount);
}

export function bidAmountFromAdvertiserCharge(chargeAmount: number) {
  if (typeof chargeAmount !== 'number' || !Number.isFinite(chargeAmount) || chargeAmount <= 0) {
    return 0;
  }
  return Math.round(chargeAmount / (1 + ADVERTISER_FEE_RATE));
}

export function creatorPayoutFromCharge(chargeAmount: number) {
  if (typeof chargeAmount !== 'number' || !Number.isFinite(chargeAmount) || chargeAmount <= 0) {
    return 0;
  }

  const bidAmount = Math.round(chargeAmount / (1 + ADVERTISER_FEE_RATE));
  return creatorPayoutAmount(bidAmount);
}

export function advertiserChargeMatchesBid(bidAmount: number, amount: number) {
  return advertiserPayableAmount(bidAmount) === amount;
}
