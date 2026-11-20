import { creatorPlatformFeeAmount, creatorPayoutAmount } from '@/lib/fee-policy';

export function creatorCombinedFeeAmount(bidAmount: number) {
  return creatorPlatformFeeAmount(bidAmount);
}

export function calculateCreatorPayout(bidAmount: number) {
  return creatorPayoutAmount(bidAmount);
}
