import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ADVERTISER_FEE_RATE,
  CREATOR_FEE_RATE,
  advertiserPayableAmount,
  bidAmountFromCreatorPayout,
  creatorPayoutAmount,
  creatorPayoutFromCharge,
  platformFeeFromAmount,
} from '../../src/lib/fees';
import {
  VAT_RATE,
  WITHHOLDING_RATE,
  describeSettlementTax,
  splitAdvertiserInvoice,
  splitAdvertiserInvoiceFromTotal,
  splitCreatorSettlement,
} from '../../src/lib/tax';

const BID_CASES = [0, 1, 10, 100, 333, 999, 1_000, 10_000, 33_333, 1_500_000, 1_234_567];

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
    }
  });

  it('10,000원 입찰의 광고주 결제·크리에이터 지급·플랫폼 수수료가 정책과 일치한다', () => {
    assert.equal(advertiserPayableAmount(10_000), 11_000);
    assert.equal(creatorPayoutAmount(10_000), 8_500);
    assert.equal(platformFeeFromAmount(10_000), 2_500);
  });

  it('1,500,000원 입찰의 광고주 결제·크리에이터 지급·플랫폼 수수료가 정책과 일치한다', () => {
    assert.equal(advertiserPayableAmount(1_500_000), 1_650_000);
    assert.equal(creatorPayoutAmount(1_500_000), 1_275_000);
    assert.equal(platformFeeFromAmount(1_500_000), 375_000);
  });
});

describe('tax: 공급가액·부가세·원천징수·최종 정산금', () => {
  it('10,000원 입찰 세금 분해가 정확하다', () => {
    const tax = describeSettlementTax(10_000);
    assert.deepEqual(tax.advertiser, {
      supplyAmount: 10_000,
      vatAmount: 1_000,
      totalAmount: 11_000,
    });
    assert.deepEqual(tax.creator, {
      awardAmount: 10_000,
      platformFee: 1_500,
      withholdingAmount: 330,
      netPayout: 8_170,
    });
  });

  it('1,500,000원 입찰 세금 분해가 정확하다', () => {
    const tax = describeSettlementTax(1_500_000);
    assert.equal(tax.advertiser.supplyAmount, 1_500_000);
    assert.equal(tax.advertiser.vatAmount, 150_000);
    assert.equal(tax.advertiser.totalAmount, 1_650_000);
    assert.equal(tax.creator.platformFee, 225_000);
    assert.equal(tax.creator.withholdingAmount, 49_500);
    assert.equal(tax.creator.netPayout, 1_225_500);
  });

  it('0원 입찰은 세금 분해가 모두 0이다', () => {
    const tax = describeSettlementTax(0);
    assert.deepEqual(tax.advertiser, { supplyAmount: 0, vatAmount: 0, totalAmount: 0 });
    assert.deepEqual(tax.creator, {
      awardAmount: 0,
      platformFee: 0,
      withholdingAmount: 0,
      netPayout: 0,
    });
  });
});

describe('정산 항등식: 입찰가 스위프', () => {
  for (const bid of BID_CASES) {
    it(`${bid.toLocaleString('ko-KR')}원에서 공급가+VAT+수수료+정산금이 맞는다`, () => {
      const invoice = splitAdvertiserInvoice(bid);
      const creator = splitCreatorSettlement(bid);
      const payable = advertiserPayableAmount(bid);
      const creatorGross = creatorPayoutAmount(bid);
      const platform = platformFeeFromAmount(bid);

      assert.equal(invoice.supplyAmount, bid <= 0 ? 0 : roundWon(bid));
      assert.equal(invoice.vatAmount, roundWon(invoice.supplyAmount * VAT_RATE));
      assert.equal(invoice.totalAmount, invoice.supplyAmount + invoice.vatAmount);
      assert.equal(payable, invoice.totalAmount);

      assert.equal(creator.platformFee, roundWon(creator.awardAmount * CREATOR_FEE_RATE));
      assert.equal(creator.withholdingAmount, roundWon(creator.awardAmount * WITHHOLDING_RATE));
      assert.equal(
        creator.netPayout,
        Math.max(0, creator.awardAmount - creator.platformFee - creator.withholdingAmount),
      );
      assert.equal(creatorGross, Math.max(0, creator.awardAmount - creator.platformFee));
      assert.equal(
        platform,
        roundWon(invoice.supplyAmount * ADVERTISER_FEE_RATE) + creator.platformFee,
      );
      assert.equal(creator.netPayout, Math.max(0, creatorGross - creator.withholdingAmount));
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

  it('0.15B가 .5로 떨어지는 금액에서 곱 한 번 반올림과 성분 합이 어긋나지 않는다', () => {
    // 10원: 10 * 0.85 = 8.5 → 곱 반올림 9원, 10-round(1.5)=8원. 성분 합(8원)이 정답.
    assert.equal(creatorPayoutAmount(10), 8);
    assert.equal(roundWon(10 * 0.15), 2);
    assert.equal(platformFeeFromAmount(10), 1 + 2);
    assert.equal(advertiserPayableAmount(10), 11);
  });

  it('1원부터 20,000원까지 성분별 반올림 항등식이 깨지지 않는다', () => {
    for (let bid = 1; bid <= 20_000; bid += 1) {
      const invoice = splitAdvertiserInvoice(bid);
      const creator = splitCreatorSettlement(bid);
      assert.equal(advertiserPayableAmount(bid), invoice.totalAmount, `advertiser ${bid}`);
      assert.equal(creatorPayoutAmount(bid), bid - creator.platformFee, `creator gross ${bid}`);
      assert.equal(
        platformFeeFromAmount(bid),
        invoice.vatAmount + creator.platformFee,
        `platform ${bid}`,
      );
      assert.equal(
        creator.netPayout + creator.platformFee + creator.withholdingAmount,
        bid,
        `creator identity ${bid}`,
      );
    }
  });

  it('VAT 포함 총액에서 역산한 공급가+부가세가 총액을 보존한다', () => {
    for (const total of [0, 1, 11, 1100, 11_000, 1_650_000]) {
      const split = splitAdvertiserInvoiceFromTotal(total);
      assert.equal(split.totalAmount, total <= 0 ? 0 : total);
      assert.equal(split.supplyAmount + split.vatAmount, split.totalAmount);
    }
  });
});

describe('역산 왕복', () => {
  it('크리에이터 지급액에서 입찰가를 역산하면 다시 같은 지급액이 나온다', () => {
    for (const bid of [10_000, 50_000, 1_500_000]) {
      const payout = creatorPayoutAmount(bid);
      const recoveredBid = bidAmountFromCreatorPayout(payout);
      assert.equal(creatorPayoutAmount(recoveredBid), payout);
    }
  });

  it('광고주 결제액에서 크리에이터 지급을 역산하면 수수료 차감과 맞는다', () => {
    const charge = advertiserPayableAmount(10_000);
    assert.equal(charge, 11_000);
    assert.equal(creatorPayoutFromCharge(charge), creatorPayoutAmount(10_000));
  });
});
