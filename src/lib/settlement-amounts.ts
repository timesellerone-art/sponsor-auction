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
  /** 공급가액 = 낙찰(제안) 금액 */
  supplyAmount: number;
  advertiserFee: number;
  advertiserFeeRate: number;
  /** 광고주 결제 합계(낙찰 + 15%) */
  advertiserCharge: number;
  creatorFeeRate: number;
  /** 크리에이터 구간 수수료(12/10/8%) */
  creatorFee: number;
  /** 최종 정산액 = 낙찰 - 구간 수수료 */
  finalSettlement: number;
  /** 개인 3.3% 원천징수. 사업자는 0 */
  withholdingAmount: number;
  /** 사업자 VAT 10%(별도 안내). 개인은 0 */
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
 * 정산·세무·이체 금액을 한곳에서 계산한다.
 * - 수수료·원천징수·부가세 성분은 Math.round(1원)
 * - 실지급(이체)액만 10원 단위 절사
 */
export function describeSettlementAmounts(
  bidAmount: number,
  taxKind: CreatorTaxKind = 'individual',
): SettlementAmounts {
  const bid = asWon(bidAmount);
  const creatorFee = creatorPlatformFeeAmount(bid);
  const finalSettlement = creatorPayoutAmount(bid);
  const withholdingAmount =
    taxKind === 'individual' ? Math.round(finalSettlement * WITHHOLDING_RATE) : 0;
  const vatAmount = taxKind === 'business' ? Math.round(finalSettlement * VAT_RATE) : 0;
  const transferGross = Math.max(0, finalSettlement - withholdingAmount);
  return {
    bidAmount: bid,
    taxKind,
    supplyAmount: bid,
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
