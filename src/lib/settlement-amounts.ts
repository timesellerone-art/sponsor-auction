import type { CreatorTaxKind } from '@/lib/business-registration';
import {
  ADVERTISER_FEE_RATE,
  VAT_RATE,
  WITHHOLDING_RATE,
  advertiserFeeFromBid,
  advertiserPayableAmount,
  advertiserTotalCharge,
  advertiserVatFromBid,
  creatorFeeRate,
  creatorPlatformFeeAmount,
  creatorPayoutAmount,
  floorToTenWon,
  platformNetFeeFromBid,
} from '@/lib/fee-policy';

export type SettlementAmounts = {
  bidAmount: number;
  taxKind: CreatorTaxKind;
  /**
   * 화면·테이블의 기준 금액 = 낙찰(제안) 금액.
   * 광고주 세금계산서 공급가액은 advertiserSupply 를 쓴다.
   */
  supplyAmount: number;
  /** 크리에이터 세금계산서 과세표준 = 최종 정산액. 개인은 부가세 0. */
  taxInvoiceSupply: number;
  advertiserFee: number;
  advertiserFeeRate: number;
  /** 광고주 공급가액 = 낙찰가 + 수수료 15%. */
  advertiserSupply: number;
  /** 광고주 부가세 = 공급가액 × 10%. */
  advertiserVat: number;
  /** 광고주 결제 합계 = 공급가액 + 부가세. */
  advertiserCharge: number;
  creatorFeeRate: number;
  /** 크리에이터 구간 수수료(12/10/8%) */
  creatorFee: number;
  /** 최종 정산액 = 낙찰 - 구간 수수료 */
  finalSettlement: number;
  /** 개인 3.3% 원천징수. 사업자는 0 */
  withholdingAmount: number;
  /**
   * 사업자: 최종 정산액 × 10% (별도 가산, 실지급액에 포함).
   * 개인: 0
   */
  vatAmount: number;
  /** 개인: 원천징수 차감 실수령액. 사업자: VAT 가산 지급액. 10원 미만 절사 */
  transferAmount: number;
  platformNetFee: number;
};

function asWon(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value);
}

/**
 * 정산·세무·이체·광고주 결제 금액 단일 계산식
 *
 * 1) 기준 금액 = 낙찰액 bid (역산하지 않음)
 * 2) 광고주 공급가액 = bid + round(bid × 15%)
 * 3) 광고주 부가세 = round(공급가액 × 10%), 결제 합계 = 공급가액 + 부가세
 * 4) 크리에이터 구간 수수료 = round(bid × 12%|10%|8%)
 * 5) 최종 정산액 = bid − 수수료
 * 6) 개인: 원천징수 = round(최종 × 3.3%), 부가세 = 0
 *    사업자: 원천징수 = 0, 부가세 = round(최종 × 10%) (별도 가산)
 * 7) 실지급액 = floor10(최종 − 원천징수 + 부가세)
 *
 * 수수료·원천징수·부가세 성분: Math.round(1원)
 * 실지급(이체)만: 10원 단위 절사
 */
export function describeSettlementAmounts(
  bidAmount: number,
  taxKind: CreatorTaxKind = 'individual',
): SettlementAmounts {
  const bid = asWon(bidAmount);
  const creatorFee = creatorPlatformFeeAmount(bid);
  const finalSettlement = creatorPayoutAmount(bid);
  const isBusiness = taxKind === 'business';
  const withholdingAmount = isBusiness
    ? 0
    : Math.round(finalSettlement * WITHHOLDING_RATE);
  const vatAmount = isBusiness ? Math.round(finalSettlement * VAT_RATE) : 0;
  const transferGross = Math.max(0, finalSettlement - withholdingAmount + vatAmount);
  const advertiserSupply = advertiserPayableAmount(bid);
  const advertiserVat = advertiserVatFromBid(bid);
  return {
    bidAmount: bid,
    taxKind,
    supplyAmount: bid,
    taxInvoiceSupply: finalSettlement,
    advertiserFee: advertiserFeeFromBid(bid),
    advertiserFeeRate: ADVERTISER_FEE_RATE,
    advertiserSupply,
    advertiserVat,
    advertiserCharge: advertiserTotalCharge(bid),
    creatorFeeRate: creatorFeeRate(bid),
    creatorFee,
    finalSettlement,
    withholdingAmount,
    vatAmount,
    transferAmount: floorToTenWon(transferGross),
    platformNetFee: platformNetFeeFromBid(bid),
  };
}

export function assertAdvertiserHoldMatchesSettlement(bidAmount: number, heldAmount: number) {
  return describeSettlementAmounts(bidAmount).advertiserCharge === heldAmount;
}
