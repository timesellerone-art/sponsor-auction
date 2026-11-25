import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { creatorTaxKind } from '../../src/lib/business-registration';
import { advertiserTotalCharge, creatorPayoutAmount, floorToTenWon } from '../../src/lib/fees';
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
  it('개인은 3.3% 원천징수·부가세 0, 검증 사업자는 원천징수 0·부가세 10%(별도)', () => {
    const individual = describeSettlementAmounts(100_000, 'individual');
    assert.equal(individual.creatorFee, 12_000);
    assert.equal(individual.finalSettlement, 88_000);
    assert.equal(individual.supplyAmount, 100_000);
    assert.equal(individual.taxInvoiceSupply, 88_000);
    assert.equal(individual.withholdingAmount, 2_904);
    assert.equal(individual.vatAmount, 0);
    assert.equal(individual.transferAmount, floorToTenWon(88_000 - 2_904));
    assert.equal(individual.advertiserSupply, 115_000);
    assert.equal(individual.advertiserVat, 11_500);
    assert.equal(individual.advertiserCharge, 126_500);
    assert.equal(assertAdvertiserHoldMatchesSettlement(100_000, 126_500), true);
    assert.equal(assertAdvertiserHoldMatchesSettlement(100_000, 115_000), false);

    const business = describeSettlementAmounts(100_000, 'business');
    assert.equal(business.withholdingAmount, 0);
    assert.equal(business.vatAmount, 8_800);
    assert.equal(business.taxInvoiceSupply, 88_000);
    assert.equal(business.transferAmount, floorToTenWon(88_000 + 8_800));
    assert.equal(business.finalSettlement, creatorPayoutAmount(100_000));
    assert.equal(business.advertiserCharge, advertiserTotalCharge(100_000));
  });

  it('검증완료만 사업자 세무이고 번호만 있으면 개인이다', () => {
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
      'individual',
    );
    assert.equal(
      creatorTaxKind({
        businessVerificationStatus: 'review_required',
        businessRegistrationNumber: '1208800001',
      }),
      'individual',
    );
    assert.equal(
      creatorTaxKind({
        businessVerificationStatus: 'unregistered',
        businessRegistrationNumber: '',
      }),
      'individual',
    );
  });

  it('목록 enrichment이 검증 여부로 개인/사업자 세무를 구분한다', () => {
    const personal = enrichPayoutAmounts(payout(), [], []);
    assert.equal(personal.taxKind, 'individual');
    assert.ok((personal.withholdingAmount ?? 0) > 0);
    assert.equal(personal.vatAmount, 0);
    assert.equal(personal.netPayoutAmount, 88_000);
    assert.equal(personal.transferAmount, floorToTenWon(88_000 - (personal.withholdingAmount ?? 0)));

    const numberOnly = enrichPayoutAmounts(payout(), [], [
      {
        id: 'creator-1',
        businessRegistrationNumber: '1208800001',
        businessVerificationStatus: 'unregistered',
      },
    ]);
    assert.equal(numberOnly.taxKind, 'individual');
    assert.ok((numberOnly.withholdingAmount ?? 0) > 0);
    assert.equal(numberOnly.vatAmount, 0);

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
    assert.equal(company.transferAmount, floorToTenWon(88_000 + 8_800));
  });
});
