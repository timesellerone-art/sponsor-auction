import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isE2EAuctionTitle, isE2EPaymentOrderId } from '../helpers/e2e-users';

describe('e2e leftover cleanup matchers', () => {
  it('E2E 캠페인 제목과 비인가 주문번호만 더미로 본다', () => {
    assert.equal(isE2EAuctionTitle('E2E 매칭 캠페인 1'), true);
    assert.equal(isE2EAuctionTitle('여름 무알콜 맥주 숏폼 캠페인'), false);
    assert.equal(isE2EPaymentOrderId('ord_unauthorized_1'), true);
    assert.equal(isE2EPaymentOrderId('ord_lvx8_abc123'), false);
  });
});
