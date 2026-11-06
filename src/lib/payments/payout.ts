export const CREATOR_COMBINED_DEDUCTION_RATE = 0.2;

function asWon(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return Math.round(value);
}

export function creatorCombinedFeeAmount(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }

  return Math.round(won * CREATOR_COMBINED_DEDUCTION_RATE);
}

export function calculateCreatorPayout(bidAmount: number) {
  const won = asWon(bidAmount);
  if (won <= 0) {
    return 0;
  }

  return Math.max(0, won - creatorCombinedFeeAmount(won));
}

export function bidAmountFromCreatorPayout(payoutAmount: number) {
  if (typeof payoutAmount !== 'number' || !Number.isFinite(payoutAmount) || payoutAmount <= 0) {
    return 0;
  }

  return Math.round(payoutAmount / (1 - CREATOR_COMBINED_DEDUCTION_RATE));
}

export function describeCreatorPayout(bidAmount: number) {
  const awardAmount = asWon(bidAmount);
  const combinedFee = creatorCombinedFeeAmount(awardAmount);
  const netPayout = calculateCreatorPayout(awardAmount);

  return {
    awardAmount,
    combinedFee,
    netPayout,
    rate: CREATOR_COMBINED_DEDUCTION_RATE,
  };
}
