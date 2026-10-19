import { CREATOR_FEE_RATE } from './fees';

export const VAT_RATE = 0.1;
export const WITHHOLDING_RATE = 0.033;

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
  netPayout: number;
};

export type SettlementTaxBreakdown = {
  advertiser: AdvertiserTaxSplit;
  creator: CreatorTaxSplit;
};

export function splitAdvertiserInvoice(bidAmount: number): AdvertiserTaxSplit {
  const supplyAmount = asWon(bidAmount);
  const vatAmount = asWon(supplyAmount * VAT_RATE);
  return {
    supplyAmount,
    vatAmount,
    totalAmount: supplyAmount + vatAmount,
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
  const platformFee = asWon(awardAmount * CREATOR_FEE_RATE);
  const withholdingAmount = asWon(awardAmount * WITHHOLDING_RATE);
  const netPayout = Math.max(0, awardAmount - platformFee - withholdingAmount);
  return {
    awardAmount,
    platformFee,
    withholdingAmount,
    netPayout,
  };
}

export function describeSettlementTax(bidAmount: number): SettlementTaxBreakdown {
  return {
    advertiser: splitAdvertiserInvoice(bidAmount),
    creator: splitCreatorSettlement(bidAmount),
  };
}
