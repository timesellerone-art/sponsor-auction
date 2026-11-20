import {
  creatorPlatformFeeAmount,
  creatorPayoutAmount,
  bidAmountFromCreatorPayout,
} from '@/lib/fee-policy';

export function creatorCombinedFeeAmount(bidAmount: number) {
  return creatorPlatformFeeAmount(bidAmount);
}

export function calculateCreatorPayout(bidAmount: number) {
  return creatorPayoutAmount(bidAmount);
}

export { bidAmountFromCreatorPayout };
