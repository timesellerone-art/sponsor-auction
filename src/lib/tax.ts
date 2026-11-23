import type { CreatorTaxKind } from '@/lib/business-registration';
import {
  VAT_RATE,
  WITHHOLDING_RATE,
  advertiserPayableAmount,
} from '@/lib/fee-policy';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';

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
  const amounts = describeSettlementAmounts(bidAmount);
  return {
    supplyAmount: amounts.supplyAmount,
    // 광고주 합산 수수료 15%. 크리에이터 부가세(10%)와 별개 — 필드명 vatAmount는 레거시 호환.
    vatAmount: amounts.advertiserFee,
    totalAmount: amounts.advertiserCharge,
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

export function splitCreatorSettlement(
  bidAmount: number,
  taxKind: CreatorTaxKind = 'individual',
): CreatorTaxSplit {
  const amounts = describeSettlementAmounts(bidAmount, taxKind);
  return {
    awardAmount: amounts.bidAmount,
    platformFee: amounts.creatorFee,
    withholdingAmount: amounts.withholdingAmount,
    businessVatAmount: amounts.vatAmount,
    netPayout: amounts.finalSettlement,
    individualNetPayout: Math.max(0, amounts.finalSettlement - amounts.withholdingAmount),
  };
}

export function describeSettlementTax(
  bidAmount: number,
  taxKind: CreatorTaxKind = 'individual',
): SettlementTaxBreakdown {
  return {
    advertiser: splitAdvertiserInvoice(bidAmount),
    creator: splitCreatorSettlement(bidAmount, taxKind),
  };
}

export function advertiserPayableMatchesHold(bidAmount: number, heldAmount: number) {
  return advertiserPayableAmount(bidAmount) === heldAmount;
}
