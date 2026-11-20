import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  campaignHoldDescription,
  campaignHoldQuote,
  campaignPayReference,
  holdRestorePlan,
  timeslotAwardReference,
} from '../../src/lib/campaign-credit';
import { ADVERTISER_FEE_RATE } from '../../src/lib/fee-policy';

describe('campaign credit hold', () => {
  it('제안 금액에 광고주 수수료 15%를 더한다', () => {
    const quote = campaignHoldQuote(100_000);
    assert.equal(ADVERTISER_FEE_RATE, 0.15);
    assert.equal(quote.fee, 15_000);
    assert.equal(quote.amount, 115_000);
    assert.match(campaignHoldDescription({ title: '여름 캠페인', bidAmount: 100_000 }), /115000|15,000|15000|수수료 15000/);
  });

  it('결제와 타임슬롯은 서로 다른 참조 키를 쓴다', () => {
    assert.equal(campaignPayReference(' ord_1 '), 'campaign-pay:ord_1');
    assert.equal(campaignPayReference('   '), '');
    assert.equal(timeslotAwardReference('slot', 'bid', 'try'), 'timeslot-award:slot:bid:try');
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
