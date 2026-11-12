import {
  VAT_RATE,
  WITHHOLDING_RATE,
  advertiserPayableAmount,
  creatorBusinessVatAmount,
  creatorIndividualNetAmount,
  creatorPlatformFeeAmount,
  creatorPayoutAmount,
  creatorWithholdingAmount,
} from '@/lib/fee-policy';

export { VAT_RATE, WITHHOLDING_RATE };

function asWon(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value);
}

export type AdvertiserTaxSplit = {
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
};

export type CreatorTaxSplit = {
  awardAmount: number;
  platformFee: number;
  withholdingAmount: number;
  businessVatAmount: number;
  netPayout: number;
  individualNetPayout: number;
};

export type SettlementTaxBreakdown = {
  advertiser: AdvertiserTaxSplit;
  creator: CreatorTaxSplit;
};

export function splitAdvertiserInvoice(bidAmount: number): AdvertiserTaxSplit {
  const supplyAmount = asWon(bidAmount);
  const totalAmount = advertiserPayableAmount(supplyAmount);
  return {
    supplyAmount,
    vatAmount: Math.max(0, totalAmount - supplyAmount),
    totalAmount,
  };
}

export function splitAdvertiserInvoiceFromTotal(totalAmount: number): AdvertiserTaxSplit {
  const total = asWon(totalAmount);
  if (total <= 0) {
    return { supplyAmount: 0, vatAmount: 0, totalAmount: 0 };
  }
  const supplyAmount = asWon(total / (1 + VAT_RATE));
  return {
    supplyAmount,
    vatAmount: Math.max(0, total - supplyAmount),
    totalAmount: total,
  };
}

export function splitCreatorSettlement(bidAmount: number): CreatorTaxSplit {
  const awardAmount = asWon(bidAmount);
  const platformFee = creatorPlatformFeeAmount(awardAmount);
  const netPayout = creatorPayoutAmount(awardAmount);
  return {
    awardAmount,
    platformFee,
    withholdingAmount: creatorWithholdingAmount(awardAmount),
    businessVatAmount: creatorBusinessVatAmount(awardAmount),
    netPayout,
    individualNetPayout: creatorIndividualNetAmount(awardAmount),
  };
}

export function describeSettlementTax(bidAmount: number): SettlementTaxBreakdown {
  return {
    advertiser: splitAdvertiserInvoice(bidAmount),
    creator: splitCreatorSettlement(bidAmount),
  };
}
