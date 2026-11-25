import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  advertiserChargeMatchesBid,
  advertiserFeeFromBid,
  advertiserPayableAmount,
  advertiserTotalCharge,
  bidAmountFromCreatorPayout,
  creatorFeeRate,
  creatorPayoutAmount,
  creatorPayoutFromCharge,
  platformFeeFromAmount,
} from '../../src/lib/fees';
import {
  ADVERTISER_FEE_RATE,
  creatorPlatformFeeAmount,
  describeFeeQuote,
  extractProposalAmounts,
} from '../../src/lib/fee-policy';
import { calculateCreatorPayout, creatorCombinedFeeAmount } from '../../src/lib/payments/payout';
import {
  VAT_RATE,
  WITHHOLDING_RATE,
  describeSettlementTax,
  splitAdvertiserInvoice,
  splitAdvertiserInvoiceFromTotal,
  splitCreatorSettlement,
} from '../../src/lib/tax';

const BID_CASES = [0, 1, 10, 100, 333, 999, 1_000, 10_000, 33_333, 1_500_000, 1_234_567, 5_000_000];

function roundWon(value: number) {
  return Math.round(value);
}

describe('fees: 가드 및 기본 금액', () => {
  it('0원·음수·비유한 입력은 전부 0원이다', () => {
    for (const invalid of [0, -1, -10_000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.equal(platformFeeFromAmount(invalid), 0);
      assert.equal(advertiserPayableAmount(invalid), 0);
      assert.equal(creatorPayoutAmount(invalid), 0);
      assert.equal(bidAmountFromCreatorPayout(invalid), 0);
      assert.equal(creatorPayoutFromCharge(invalid), 0);
      assert.equal(calculateCreatorPayout(invalid), 0);
    }
  });

  it('10,000원 제안의 광고주 15%·크리에이터 12%가 정책과 일치한다', () => {
    assert.equal(ADVERTISER_FEE_RATE, 0.15);
    assert.equal(creatorFeeRate(10_000), 0.12);
    assert.equal(advertiserPayableAmount(10_000), 11_500);
    assert.equal(creatorPayoutAmount(10_000), 8_800);
    assert.equal(calculateCreatorPayout(10_000), 8_800);
    assert.equal(creatorCombinedFeeAmount(10_000), 1_200);
    assert.equal(platformFeeFromAmount(10_000), 2_700);
  });

  it('1,500,000원 제안은 중형 10%, 5,000,000원은 대형 8%다', () => {
    assert.equal(creatorFeeRate(1_000_000), 0.1);
    assert.equal(creatorFeeRate(1_500_000), 0.1);
    assert.equal(creatorFeeRate(4_999_999), 0.1);
    assert.equal(creatorFeeRate(5_000_000), 0.08);
    assert.equal(advertiserPayableAmount(1_500_000), 1_725_000);
    assert.equal(creatorPayoutAmount(1_500_000), 1_350_000);
    assert.equal(platformFeeFromAmount(1_500_000), 375_000);
    assert.equal(creatorPlatformFeeAmount(5_000_000), 400_000);
  });

  it('광고주 공급가액은 낙찰가 + 15%이고 결제는 부가세 10%를 별도 가산한다', () => {
    for (const bid of [1, 10_000, 120_000, 1_500_000]) {
      const supply = bid + Math.round(bid * 0.15);
      const total = supply + Math.round(supply * VAT_RATE);
      assert.equal(advertiserPayableAmount(bid), supply);
      assert.equal(advertiserTotalCharge(bid), total);
      assert.equal(advertiserChargeMatchesBid(bid, total), true);
      assert.equal(advertiserChargeMatchesBid(bid, supply), false);
    }
  });
});

describe('tax: 공급가액·부가세·원천징수·최종 정산금', () => {
  it('10,000원 제안 세금 분해가 정확하다', () => {
    const individual = describeSettlementTax(10_000, 'individual');
    assert.deepEqual(individual.advertiser, {
      supplyAmount: 11_500,
      vatAmount: 1_150,
      totalAmount: 12_650,
    });
    assert.deepEqual(individual.creator, {
      awardAmount: 10_000,
      platformFee: 1_200,
      withholdingAmount: 290,
      businessVatAmount: 0,
      netPayout: 8_800,
      individualNetPayout: 8_510,
    });
    const business = describeSettlementTax(10_000, 'business');
    assert.equal(business.creator.withholdingAmount, 0);
    assert.equal(business.creator.businessVatAmount, 880);
    assert.equal(business.creator.individualNetPayout, 8_800);
  });

  it('1,500,000원 제안 세금 분해가 정확하다', () => {
    const tax = describeSettlementTax(1_500_000, 'individual');
    assert.equal(tax.advertiser.supplyAmount, 1_725_000);
    assert.equal(tax.advertiser.vatAmount, 172_500);
    assert.equal(tax.advertiser.totalAmount, 1_897_500);
    assert.equal(tax.creator.platformFee, 150_000);
    assert.equal(tax.creator.withholdingAmount, 44_550);
    assert.equal(tax.creator.businessVatAmount, 0);
    assert.equal(tax.creator.netPayout, 1_350_000);
    assert.equal(tax.creator.individualNetPayout, 1_305_450);
    const business = describeSettlementTax(1_500_000, 'business');
    assert.equal(business.creator.withholdingAmount, 0);
    assert.equal(business.creator.businessVatAmount, 135_000);
  });

  it('0원 제안은 세금 분해가 모두 0이다', () => {
    const tax = describeSettlementTax(0);
    assert.deepEqual(tax.advertiser, { supplyAmount: 0, vatAmount: 0, totalAmount: 0 });
    assert.deepEqual(tax.creator, {
      awardAmount: 0,
      platformFee: 0,
      withholdingAmount: 0,
      businessVatAmount: 0,
      netPayout: 0,
      individualNetPayout: 0,
    });
  });
});

describe('정산 항등식: 입찰가 스위프', () => {
  for (const bid of BID_CASES) {
    it(`${bid.toLocaleString('ko-KR')}원에서 공급가+합산수수료+정산금이 맞는다`, () => {
      const invoice = splitAdvertiserInvoice(bid);
      const creator = splitCreatorSettlement(bid);
      const payable = advertiserTotalCharge(bid);
      const creatorGross = creatorPayoutAmount(bid);
      const platform = platformFeeFromAmount(bid);
      const rate = creatorFeeRate(bid);

      assert.equal(invoice.supplyAmount, advertiserPayableAmount(bid));
      assert.equal(invoice.vatAmount, bid <= 0 ? 0 : roundWon(invoice.supplyAmount * VAT_RATE));
      assert.equal(invoice.totalAmount, invoice.supplyAmount + invoice.vatAmount);
      assert.equal(payable, invoice.totalAmount);

      assert.equal(creator.platformFee, roundWon(creator.awardAmount * rate));
      assert.equal(creator.withholdingAmount, roundWon(creator.netPayout * WITHHOLDING_RATE));
      assert.equal(creator.businessVatAmount, 0);
      const business = splitCreatorSettlement(bid, 'business');
      assert.equal(business.withholdingAmount, 0);
      assert.equal(business.businessVatAmount, roundWon(business.netPayout * VAT_RATE));
      assert.equal(creator.netPayout, Math.max(0, creator.awardAmount - creator.platformFee));
      assert.equal(creatorGross, creator.netPayout);
      assert.equal(platform, advertiserFeeFromBid(bid) + creator.platformFee);
      assert.equal(creator.netPayout + creator.platformFee, creator.awardAmount);
    });
  }
});

describe('부동소수점·반올림 예외', () => {
  it('0.1+0.2 같은 이진 오차가 원 단위 결과에 누적되지 않는다', () => {
    const noisy = 0.1 + 0.2;
    assert.notEqual(noisy, 0.3);
    assert.equal(advertiserPayableAmount(noisy), 0);
    assert.equal(splitAdvertiserInvoice(noisy).vatAmount, 0);
  });

  it('반올림 경계(x.5원)는 Math.round 정책으로 정수 원이 된다', () => {
    assert.equal(advertiserPayableAmount(0.4), 0);
    assert.equal(advertiserPayableAmount(0.5), 1);
    assert.equal(advertiserPayableAmount(1.5), 2);
    assert.equal(splitAdvertiserInvoice(1.5).supplyAmount, 2);
  });

  it('12% 소액 구간에서 곱 한 번 반올림과 성분 합이 어긋나지 않는다', () => {
    assert.equal(creatorPayoutAmount(10), 9);
    assert.equal(roundWon(10 * 0.12), 1);
    assert.equal(platformFeeFromAmount(10), 2 + 1);
    assert.equal(advertiserPayableAmount(10), 12);
  });

  it('1원부터 20,000원까지 성분별 반올림 항등식이 깨지지 않는다', () => {
    for (let bid = 1; bid <= 20_000; bid += 1) {
      const invoice = splitAdvertiserInvoice(bid);
      const creator = splitCreatorSettlement(bid);
      assert.equal(advertiserTotalCharge(bid), invoice.totalAmount, `advertiser ${bid}`);
      assert.equal(creatorPayoutAmount(bid), bid - creator.platformFee, `creator gross ${bid}`);
      assert.equal(
        platformFeeFromAmount(bid),
        advertiserFeeFromBid(bid) + creator.platformFee,
        `platform ${bid}`,
      );
      assert.equal(creator.netPayout + creator.platformFee, bid, `creator identity ${bid}`);
    }
  });

  it('VAT 포함 총액에서 역산한 공급가+부가세가 총액을 보존한다', () => {
    for (const total of [0, 1, 11, 1100, 11_500, 1_725_000]) {
      const split = splitAdvertiserInvoiceFromTotal(total);
      assert.equal(split.totalAmount, total <= 0 ? 0 : total);
      assert.equal(split.supplyAmount + split.vatAmount, split.totalAmount);
    }
  });
});

describe('역산 왕복', () => {
  it('크리에이터 지급액에서 제안가를 역산하면 다시 같은 지급액이 나온다', () => {
    for (const bid of [10_000, 50_000, 1_500_000, 5_000_000]) {
      const payout = creatorPayoutAmount(bid);
      const recoveredBid = bidAmountFromCreatorPayout(payout);
      assert.equal(creatorPayoutAmount(recoveredBid), payout);
    }
  });

  it('광고주 결제액에서 크리에이터 지급을 역산하면 수수료 차감과 맞는다', () => {
    const charge = advertiserTotalCharge(10_000);
    assert.equal(charge, 12_650);
    assert.equal(creatorPayoutFromCharge(charge), creatorPayoutAmount(10_000));
  });
});

describe('상담용 금액 파싱', () => {
  it('250만 원 질문을 중형 10% 견적으로 계산한다', () => {
    const amounts = extractProposalAmounts('250만 원 제안하면 얼마 받나요?');
    assert.deepEqual(amounts, [2_500_000]);
    const quote = describeFeeQuote(amounts[0] ?? 0);
    assert.equal(quote.creatorRatePercent, 10);
    assert.equal(quote.creatorFee, 250_000);
    assert.equal(quote.creatorPayout, 2_250_000);
    assert.equal(quote.individualWithholding, 74_250);
    assert.equal(quote.individualNet, 2_175_750);
    assert.equal(quote.businessVat, 225_000);
    assert.equal(quote.advertiserPayable, 2_875_000);
    assert.equal(quote.advertiserVat, 287_500);
    assert.equal(quote.advertiserTotal, 3_162_500);
  });
});
