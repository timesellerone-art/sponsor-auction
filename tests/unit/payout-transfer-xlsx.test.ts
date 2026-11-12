import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DELETED_CAMPAIGN_LABEL } from '../../src/lib/admin-integrity';
import { floorToTenWon } from '../../src/lib/fees';
import { calculateCreatorPayout } from '../../src/lib/payments/payout';
import {
  TRANSFER_RECIPIENT_LABEL,
  TRANSFER_XLSX_HEADERS,
  buildPayoutTransferXlsx,
  collectPayoutTransferRows,
  digitsOnlyAccount,
  parseBankAccountField,
  parsePayoutTransferXlsx,
  transferPayoutAmount,
} from '../../src/lib/payout-transfer-xlsx';
import type { PayoutItem } from '../../src/types/admin';

function payout(partial: Partial<PayoutItem> & Pick<PayoutItem, 'id' | 'status'>): PayoutItem {
  return {
    creatorId: 'usr-test',
    creatorName: '테스트 크리에이터',
    creatorEmail: 'creator@demo.com',
    amount: 8_800,
    auctionTitle: '테스트 캠페인',
    requestedAt: '2026-11-09T00:00:00+09:00',
    bidAmount: 10_000,
    bankAccount: '신한은행 110-123-456789',
    auctionId: 'auc-test',
    ...partial,
  };
}

describe('계좌번호 정규화', () => {
  it('하이픈·공백·특수문자를 제거하고 숫자만 남긴다', () => {
    assert.equal(digitsOnlyAccount('  110-123-456789  '), '110123456789');
    assert.equal(digitsOnlyAccount('신한은행 110-123-456789'), '110123456789');
    assert.equal(digitsOnlyAccount('3333-01-1234567'), '3333011234567');
  });

  it('앞자리 0을 포함한 계좌를 문자열로 보존한다', () => {
    const zeroPhone = parseBankAccountField('우리은행 010-12-345678');
    assert.equal(zeroPhone?.bankName, '우리은행');
    assert.equal(zeroPhone?.accountNumber, '01012345678');
    assert.equal(zeroPhone?.accountNumber.startsWith('0'), true);

    const area = parseBankAccountField('기업은행 02-123-456789');
    assert.equal(area?.bankName, '기업은행');
    assert.equal(area?.accountNumber, '02123456789');
  });

  it('은행명이 없으면 파싱 결과에서 은행을 비운다', () => {
    const parsed = parseBankAccountField('010-1234-5678');
    assert.equal(parsed?.bankName, '');
    assert.equal(parsed?.accountNumber, '01012345678');
  });
});

describe('실정산액 10원 절사', () => {
  it('구간 수수료 공제 후 10원 단위 절사가 payout.ts와 일치한다', () => {
    for (const bid of [10_000, 12_345, 33_333, 980_000, 1_234_567]) {
      const item = payout({
        id: `payout-${bid}`,
        status: 'pending',
        bidAmount: bid,
        amount: calculateCreatorPayout(bid),
      });
      assert.equal(transferPayoutAmount(item), floorToTenWon(calculateCreatorPayout(bid)));
      assert.equal(transferPayoutAmount(item) % 10, 0);
    }
  });

  it('1원 단위 잔액은 버리고 10원 단위만 남긴다', () => {
    const item = payout({
      id: 'payout-odd',
      status: 'pending',
      bidAmount: 333,
      amount: calculateCreatorPayout(333),
    });
    assert.equal(calculateCreatorPayout(333), 293);
    assert.equal(transferPayoutAmount(item), 290);
  });
});

describe('대량이체 대상 필터', () => {
  it('지급 완료·취소·고아·계좌 누락 건은 제외하고 대기 건만 남긴다', () => {
    const { rows, skipped } = collectPayoutTransferRows([
      payout({
        id: 'pending-ok',
        status: 'pending',
        bankAccount: ' 신한은행  110-123-456789 ',
        bidAmount: 10_000,
      }),
      {
        ...payout({ id: 'pending-payout-ok', status: 'pending', bidAmount: 10_000 }),
        status: 'pending_payout',
      } as unknown as PayoutItem,
      payout({ id: 'paid', status: 'paid', bidAmount: 10_000 }),
      payout({ id: 'cancelled', status: 'cancelled', bidAmount: 10_000 }),
      {
        ...payout({ id: 'canceled', status: 'pending', bidAmount: 10_000 }),
        status: 'canceled',
      } as unknown as PayoutItem,
      payout({
        id: 'orphan-deleted',
        status: 'pending',
        auctionTitle: DELETED_CAMPAIGN_LABEL,
        bidAmount: 10_000,
      }),
      payout({
        id: 'orphan-no-campaign',
        status: 'pending',
        auctionId: '',
        bidAmount: 10_000,
      }),
      payout({
        id: 'no-bank',
        status: 'pending',
        bankAccount: '010-1234-567890',
        bidAmount: 10_000,
      }),
      payout({
        id: 'no-account',
        status: 'pending',
        bankAccount: '신한은행',
        bidAmount: 10_000,
      }),
    ]);

    assert.deepEqual(
      rows.map((item) => item.sourceId).sort(),
      ['pending-ok', 'pending-payout-ok'],
    );
    assert.equal(rows[0]?.bankName === '신한은행' || rows[1]?.bankName === '신한은행', true);
    assert.equal(
      rows.every((item) => item.accountNumber === '110123456789' && item.amount === 8_800),
      true,
    );
    assert.deepEqual(
      skipped.map((item) => item.reason).sort(),
      [
        'cancelled',
        'cancelled',
        'missing_account',
        'missing_bank',
        'orphan',
        'orphan',
        'paid',
      ],
    );
  });
});

describe('xlsx 라운드트립', () => {
  it('계좌 앞자리 0과 확정 정수 금액을 텍스트/숫자로 유지하고 수식은 넣지 않는다', () => {
    const { bytes, rows } = buildPayoutTransferXlsx([
      payout({
        id: 'zero-phone',
        status: 'pending',
        bankAccount: '우리은행 010-12-345678',
        creatorName: '제로계좌',
        bidAmount: 12_345,
        amount: calculateCreatorPayout(12_345),
      }),
      payout({
        id: 'zero-area',
        status: 'pending',
        bankAccount: '기업은행 02-123-456789',
        creatorName: '지역번호',
        bidAmount: 33_333,
        amount: calculateCreatorPayout(33_333),
      }),
      payout({ id: 'paid-skip', status: 'paid', bidAmount: 1_500_000 }),
    ]);

    assert.equal(rows.length, 2);
    const parsed = parsePayoutTransferXlsx(bytes);
    assert.deepEqual(parsed.headers, [...TRANSFER_XLSX_HEADERS]);
    assert.equal(parsed.rows.length, 2);

    const phone = parsed.rows.find((row) => row.accountNumber.startsWith('0') && row.accountNumber.startsWith('010'));
    const area = parsed.rows.find((row) => row.accountNumber.startsWith('02'));
    assert.equal(phone?.accountNumber, '01012345678');
    assert.equal(phone?.bankName, '우리은행');
    assert.equal(phone?.amount, floorToTenWon(calculateCreatorPayout(12_345)));
    assert.equal(area?.accountNumber, '02123456789');
    assert.equal(area?.amount, floorToTenWon(calculateCreatorPayout(33_333)));
    assert.equal(/<f[ >]/.test(parsed.xml), false);
    assert.equal(/=SUM/i.test(parsed.xml), false);
    assert.equal(parsed.xml.includes('t="inlineStr"'), false);
    assert.equal(parsed.xml.includes('t="s"'), true);
    assert.equal(parsed.xml.includes('t="n"'), true);
    assert.equal(parsed.sharedStrings.includes('01012345678'), true);
    assert.equal(parsed.sharedStrings.includes('02123456789'), true);
    assert.equal(parsed.styles.includes('numFmtId="164"'), true);
    assert.equal(parsed.styles.includes('formatCode="@"'), true);
    assert.equal(parsed.rows.every((row) => row.recipientLabel === TRANSFER_RECIPIENT_LABEL), true);
    assert.equal(
      parsed.rows.every((row) => Number.isInteger(row.amount) && row.amount % 10 === 0),
      true,
    );
  });
});
