import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  campaignHoldDescription,
  campaignHoldLedgerLabel,
  campaignHoldQuote,
  campaignPayReference,
  holdRestorePlan,
  parseCampaignHoldBidAmount,
  timeslotAwardReference,
} from '../../src/lib/campaign-credit';
import { ADVERTISER_FEE_RATE } from '../../src/lib/fee-policy';

describe('campaign credit hold', () => {
  it('제안 금액에 광고주 수수료 15%와 부가세 10%를 더한다', () => {
    const quote = campaignHoldQuote(100_000);
    assert.equal(ADVERTISER_FEE_RATE, 0.15);
    assert.equal(quote.fee, 15_000);
    assert.equal(quote.supply, 115_000);
    assert.equal(quote.vat, 11_500);
    assert.equal(quote.amount, 126_500);
    assert.match(
      campaignHoldDescription({ title: '여름 캠페인', bidAmount: 100_000 }),
      /공급가액 115000원[\s\S]*부가세 11500원[\s\S]*총 126500원/,
    );
  });

  it('결제와 타임슬롯은 서로 다른 참조 키를 쓴다', () => {
    assert.equal(campaignPayReference(' ord_1 '), 'campaign-pay:ord_1');
    assert.equal(campaignPayReference('   '), '');
    assert.equal(timeslotAwardReference('slot', 'bid', 'try'), 'timeslot-award:slot:bid:try');
  });

  it('원장 문구는 낙찰가에서 공급가액과 부가세를 전방으로 계산한다', () => {
    const quote = campaignHoldQuote(900_000);
    assert.equal(quote.supply, 1_035_000);
    assert.equal(quote.vat, 103_500);
    assert.equal(quote.amount, 1_138_500);
    const holdDescription = campaignHoldDescription({ title: '여름 캠페인', bidAmount: 900_000 });
    assert.equal(parseCampaignHoldBidAmount(holdDescription), 900_000);
    const holdLabel = campaignHoldLedgerLabel({
      type: 'HOLD',
      amount: quote.amount,
      description: holdDescription,
    });
    assert.match(holdLabel, /공급가액 1,035,000원\(낙찰 900,000\+수수료 135,000\)/);
    assert.match(holdLabel, /부가세 103,500원/);
    assert.match(holdLabel, /총 1,138,500원/);
    assert.doesNotMatch(holdLabel, /부가세 10% 0원/);
    assert.doesNotMatch(holdLabel, /낙찰\+수수료 15%/);

    const oldHold = '여름 캠페인 채택: 제안 100000원 + 수수료 15000원';
    const recovered = campaignHoldLedgerLabel({
      type: 'HOLD',
      amount: 115_000,
      description: oldHold,
    });
    assert.match(recovered, /공급가액 115,000원\(낙찰 100,000\+수수료 15,000\)/);
    assert.match(recovered, /부가세 11,500원/);
    assert.doesNotMatch(recovered, /부가세 10% 0원/);

    const reverseFree = campaignHoldLedgerLabel({
      type: 'RELEASE',
      amount: 1_138_500,
    });
    assert.doesNotMatch(reverseFree, /공급가액 1,035,000원 · 부가세 103,500원/);
    assert.doesNotMatch(reverseFree, /부가세 10% 0원/);
    assert.match(reverseFree, /총 1,138,500원/);

    const releaseFromHold = campaignHoldLedgerLabel({
      type: 'RELEASE',
      amount: quote.amount,
      description: holdDescription,
    });
    assert.match(releaseFromHold, /예치 해제: 공급가액 1,035,000원\(낙찰 900,000\+수수료 135,000\)/);
    assert.match(releaseFromHold, /부가세 103,500원/);
  });

  it('같은 참조의 HOLD는 한 번만 RELEASE 한다', () => {
    const referenceId = 'campaign-pay:ord_1';
    const rows = [
      {
        user_id: 'user-1',
        type: 'HOLD' as const,
        amount: 115_000,
        reference_id: referenceId,
      },
    ];
    assert.deepEqual(holdRestorePlan(rows, referenceId), {
      action: 'release',
      userId: 'user-1',
      amount: 115_000,
    });
    assert.equal(
      holdRestorePlan(
        [
          ...rows,
          {
            user_id: 'user-1',
            type: 'RELEASE' as const,
            amount: 115_000,
            reference_id: referenceId,
          },
        ],
        referenceId,
      ).action,
      'skip',
    );
    assert.equal(holdRestorePlan([], referenceId).reason, 'missing');
  });
});
