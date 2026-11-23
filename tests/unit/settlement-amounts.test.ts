import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { creatorTaxKind } from '../../src/lib/business-registration';
import {
  advertiserPayableAmount,
  creatorPayoutAmount,
  floorToTenWon,
} from '../../src/lib/fees';
import {
  assertAdvertiserHoldMatchesSettlement,
  describeSettlementAmounts,
} from '../../src/lib/settlement-amounts';
import { enrichPayoutAmounts } from '../../src/lib/admin-integrity';
import type { PayoutItem } from '../../src/types/admin';

const payout = (overrides: Partial<PayoutItem> = {}): PayoutItem => ({
  id: 'payout-test',
  creatorId: 'creator-1',
  creatorName: '테스트',
  creatorEmail: 'creator@example.com',
  amount: 88_000,
  status: 'pending',
  auctionTitle: '테스트 캠페인',
  requestedAt: '2026-11-20T00:00:00.000Z',
  bidAmount: 100_000,
  ...overrides,
});

describe('settlement amounts', () => {
  it('개인은 3.3% 원천징수 후 10원 절사 실지급, 사업자는 원천징수 0이다', () => {
    const individual = describeSettlementAmounts(100_000, 'individual');
    assert.equal(individual.creatorFee, 12_000);
    assert.equal(individual.finalSettlement, 88_000);
    assert.equal(individual.withholdingAmount, 2_904);
    assert.equal(individual.vatAmount, 0);
    assert.equal(individual.transferAmount, floorToTenWon(88_000 - 2_904));
    assert.equal(individual.advertiserCharge, 115_000);
    assert.equal(assertAdvertiserHoldMatchesSettlement(100_000, 115_000), true);

    const business = describeSettlementAmounts(100_000, 'business');
    assert.equal(business.withholdingAmount, 0);
    assert.equal(business.vatAmount, 8_800);
    assert.equal(business.transferAmount, 88_000);
    assert.equal(business.finalSettlement, creatorPayoutAmount(100_000));
    assert.equal(business.advertiserCharge, advertiserPayableAmount(100_000));
  });

  it('사업자등록번호 보유/검증이면 사업자 세무다', () => {
    assert.equal(
      creatorTaxKind({
        businessVerificationStatus: 'verified',
        businessRegistrationNumber: '',
      }),
      'business',
    );
    assert.equal(
      creatorTaxKind({
        businessVerificationStatus: 'unregistered',
        businessRegistrationNumber: '1208800001',
      }),
      'business',
    );
    assert.equal(
      creatorTaxKind({
        businessVerificationStatus: 'unregistered',
        businessRegistrationNumber: '',
      }),
      'individual',
    );
  });

  it('목록 enrichment이 개인/사업자 세무를 구분한다', () => {
    const personal = enrichPayoutAmounts(payout(), [], []);
    assert.equal(personal.taxKind, 'individual');
    assert.ok((personal.withholdingAmount ?? 0) > 0);
    assert.equal(personal.vatAmount, 0);
    assert.equal(personal.netPayoutAmount, 88_000);
    assert.equal(personal.transferAmount, floorToTenWon(88_000 - (personal.withholdingAmount ?? 0)));

    const company = enrichPayoutAmounts(payout(), [], [
      {
        id: 'creator-1',
        businessRegistrationNumber: '1208800001',
        businessVerificationStatus: 'verified',
      },
    ]);
    assert.equal(company.taxKind, 'business');
    assert.equal(company.withholdingAmount, 0);
    assert.equal(company.vatAmount, 8_800);
    assert.equal(company.transferAmount, 88_000);
  });
});
