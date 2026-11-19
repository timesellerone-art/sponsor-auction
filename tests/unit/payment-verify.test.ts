import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PAYMENT_VERIFY_DEFAULT_AMOUNT,
  PAYMENT_VERIFY_PRODUCT_NAME,
  isPaymentVerifyAmount,
  isPaymentVerifyOrderId,
} from '../../src/lib/payment-verify';
import { isAuthPassthroughPath, needsProtectedAuthValidation } from '../../src/lib/auth-paths';

describe('payment verify helpers', () => {
  it('100원과 1,000원만 허용한다', () => {
    assert.equal(isPaymentVerifyAmount(100), true);
    assert.equal(isPaymentVerifyAmount(1000), true);
    assert.equal(isPaymentVerifyAmount(PAYMENT_VERIFY_DEFAULT_AMOUNT), true);
    assert.equal(isPaymentVerifyAmount(1500), false);
    assert.equal(PAYMENT_VERIFY_PRODUCT_NAME.includes('테스트 결제'), true);
  });

  it('검수 주문번호와 공개 경로만 허용한다', () => {
    assert.equal(isPaymentVerifyOrderId('pvr_abc'), true);
    assert.equal(isPaymentVerifyOrderId('ord_abc'), false);
    assert.equal(isAuthPassthroughPath('/payment-verify'), true);
    assert.equal(isAuthPassthroughPath('/payment-verify/success'), true);
    assert.equal(needsProtectedAuthValidation('/payment-verify'), false);
  });
});
