import type { CreatorTaxKind } from '@/lib/business-registration';
import {
  ADVERTISER_FEE_RATE,
  VAT_RATE,
  WITHHOLDING_RATE,
  advertiserFeeFromBid,
  advertiserPayableAmount,
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
   * 목록·세무 화면의 공급가액 = 낙찰(제안) 금액.
   * 세금계산서 과세표준(부가세 기준)은 taxInvoiceSupply 를 쓴다.
   */
  supplyAmount: number;
  /** 부가세 과세표준 = 최종 정산액. 개인·미검증은 부가세 0이라 표시만 동일. */
  taxInvoiceSupply: number;
  advertiserFee: number;
  advertiserFeeRate: number;
  /** 광고주 결제 합계(낙찰 + 15%). 부가세(10%)와 별개. */
  advertiserCharge: number;
  creatorFeeRate: number;
  /** 크리에이터 구간 수수료(12/10/8%) */
  creatorFee: number;
  /** 최종 정산액 = 낙찰 - 구간 수수료 */
  finalSettlement: number;
  /** 개인 3.3% 원천징수. 검증 사업자는 0 */
  withholdingAmount: number;
  /**
   * 검증 사업자: 최종 정산액 × 10% (세금계산서 별도, 이체액에 미포함).
   * 개인·미검증: 0
   */
  vatAmount: number;
  /** 원천징수 차감 후 이체 대상. 10원 미만 절사 */
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
 * 정산·세무·이체 금액 단일 계산식 (확정안)
 *
 * 1) 낙찰액 bid
 * 2) 등급 수수료 = round(bid × 12%|10%|8%)
 * 3) 최종 정산액 = bid − 수수료
 * 4) 개인: 원천징수 = round(최종 × 3.3%), 부가세 = 0
 *    검증 사업자: 원천징수 = 0, 부가세 = round(최종 × 10%) (별도)
 * 5) 실지급액 = floor10(최종 − 원천징수)
 * 6) 광고주 차감 = bid + round(bid × 15%)
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
  const transferGross = Math.max(0, finalSettlement - withholdingAmount);
  return {
    bidAmount: bid,
    taxKind,
    supplyAmount: bid,
    taxInvoiceSupply: finalSettlement,
    advertiserFee: advertiserFeeFromBid(bid),
    advertiserFeeRate: ADVERTISER_FEE_RATE,
    advertiserCharge: advertiserPayableAmount(bid),
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
  const expected = describeSettlementAmounts(bidAmount).advertiserCharge;
  return expected === heldAmount;
}
