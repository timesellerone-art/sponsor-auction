import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addBusinessDays, formatSeoulDateLabel, settlementDueAtIso } from '../../src/lib/business-days';
import { creatorFeeRate, creatorPayoutAmount, creatorPlatformFeeAmount } from '../../src/lib/fees';
import { mapPayout } from '../../src/lib/payouts';
import {
  bankAccountWithHolder,
  composeBankAccount,
  creatorSettlementError,
  creatorSettlementFromRow,
  formatSettlementAccount,
  parseSettlementType,
  SETTLEMENT_TYPE_LABEL,
  settlementAccountError,
  settlementAccountFromParts,
} from '../../src/lib/settlement-account';
import { validateSettlementContact } from '../../src/lib/validation';

describe('creator payout brackets', () => {
  it('100만 원 미만은 12%, 100만 원 이상은 10%, 500만 원 이상은 8%를 뺀다', () => {
    assert.equal(creatorFeeRate(100_000), 0.12);
    assert.equal(creatorPlatformFeeAmount(100_000), 12_000);
    assert.equal(creatorPayoutAmount(100_000), 88_000);

    assert.equal(creatorFeeRate(1_000_000), 0.1);
    assert.equal(creatorPlatformFeeAmount(1_000_000), 100_000);
    assert.equal(creatorPayoutAmount(1_000_000), 900_000);

    assert.equal(creatorFeeRate(5_000_000), 0.08);
    assert.equal(creatorPlatformFeeAmount(5_000_000), 400_000);
    assert.equal(creatorPayoutAmount(5_000_000), 4_600_000);
  });
});

describe('settlement business days', () => {
  it('요청일을 세지 않고 주말과 관공서 공휴일을 건너 4영업일을 계산한다', () => {
    assert.equal(addBusinessDays('2026-11-20', 4), '2026-11-26');
    assert.equal(addBusinessDays('2026-02-13', 4), '2026-02-24');
    assert.equal(addBusinessDays('2026-02-27', 4), '2026-03-06');
    assert.equal(settlementDueAtIso('2026-11-20T15:00:00+09:00'), '2026-11-26T00:00:00+09:00');
    assert.equal(formatSeoulDateLabel('2026-11-26T00:00:00+09:00'), '2026.11.26');
  });
});

describe('settlement account', () => {
  it('은행과 계좌번호만 이체용 문자열로 만들고 예금주는 따로 둔다', () => {
    const account = settlementAccountFromParts({
      bankName: ' 신한은행 ',
      accountNumber: '110-123-456789',
      accountHolder: ' 홍길동 ',
    });
    assert.deepEqual(account, {
      bankName: '신한은행',
      accountNumber: '110123456789',
      accountHolder: '홍길동',
    });
    assert.equal(composeBankAccount(account), '신한은행 110123456789');
    assert.equal(bankAccountWithHolder(account), '신한은행 110123456789 / 홍길동');
    assert.equal(formatSettlementAccount(account), '신한은행 110123456789 홍길동');
    const mapped = mapPayout({
      id: 'payout-1',
      status: 'pending',
      amount: creatorPayoutAmount(100_000),
      requested_at: '2026-11-20T06:00:00.000Z',
      bank_account: bankAccountWithHolder(account),
    });
    assert.equal(mapped?.amount, 88_000);
    assert.equal(mapped?.bankName, '신한은행');
    assert.equal(mapped?.accountNumber, '110123456789');
    assert.equal(mapped?.accountHolder, '홍길동');
    assert.equal(mapped?.settlementDueAt, '2026-11-26T00:00:00+09:00');
    assert.equal(settlementAccountError(account), null);
    assert.equal(
      validateSettlementContact({
        email: 'creator@example.com',
        bankName: account.bankName,
        accountNumber: account.accountNumber,
        accountHolder: account.accountHolder,
      }),
      null,
    );
  });

  it('정산 유형은 개인 프리랜서와 사업자로 저장한다', () => {
    assert.equal(parseSettlementType('business'), 'business');
    assert.equal(parseSettlementType('individual'), 'individual');
    assert.equal(parseSettlementType('unknown'), 'individual');
    assert.equal(SETTLEMENT_TYPE_LABEL.individual, '개인 프리랜서');
    assert.equal(SETTLEMENT_TYPE_LABEL.business, '사업자');
    const saved = creatorSettlementFromRow({
      bank_name: '국민은행',
      account_number: '123-45-678901',
      account_holder: '김정산',
      settlement_type: 'business',
    });
    assert.equal(saved.bankName, '국민은행');
    assert.equal(saved.accountNumber, '12345678901');
    assert.equal(saved.accountHolder, '김정산');
    assert.equal(saved.settlementType, 'business');
    assert.equal(creatorSettlementError(saved), null);
    assert.equal(
      creatorSettlementError({
        bankName: '',
        accountNumber: '',
        accountHolder: '',
        settlementType: 'individual',
      }),
      '은행명을 입력해 주세요.',
    );
  });
});
