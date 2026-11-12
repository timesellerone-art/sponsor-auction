import {
  creatorFeeRate,
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

export function describeCreatorPayout(bidAmount: number) {
  const awardAmount =
    typeof bidAmount === 'number' && Number.isFinite(bidAmount) && bidAmount > 0
      ? Math.round(bidAmount)
      : 0;
  const combinedFee = creatorCombinedFeeAmount(awardAmount);
  const netPayout = calculateCreatorPayout(awardAmount);

  return {
    awardAmount,
    combinedFee,
    netPayout,
    rate: creatorFeeRate(awardAmount),
  };
}
