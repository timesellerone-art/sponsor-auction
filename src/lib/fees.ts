export const ADVERTISER_FEE_RATE = 0.1;
export const CREATOR_FEE_RATE = 0.15;

export function platformFeeFromAmount(amount: number) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return 0;
  }

  return Math.round(amount * ADVERTISER_FEE_RATE + amount * CREATOR_FEE_RATE);
}

export function advertiserPayableAmount(bidAmount: number) {
  if (typeof bidAmount !== 'number' || !Number.isFinite(bidAmount) || bidAmount <= 0) {
    return 0;
  }

  return Math.round(bidAmount + bidAmount * ADVERTISER_FEE_RATE);
}
