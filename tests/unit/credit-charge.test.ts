import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessCreditCharge, isCreditChargeOrderId } from '../../src/lib/credit-charge-shared';

describe('credit charge assessment', () => {
  it('캠페인 주문과 크레딧 주문을 구분한다', () => {
    assert.equal(isCreditChargeOrderId('crd_order_1'), true);
    assert.equal(isCreditChargeOrderId('ord_award'), false);
  });

  it('결제 금액이 주문 금액과 같으면 충전한다', () => {
    const decision = assessCreditCharge({
      orderAmount: 10_000,
      paidAmount: 10_000,
      outcome: 'confirmed',
      paymentKey: 'pay_credit_1',
      boundPaymentKey: null,
    });
    assert.deepEqual(decision, { action: 'charge' });
  });

  it('금액이 다르거나 결제가 취소되면 충전하지 않는다', () => {
    assert.equal(
      assessCreditCharge({
        orderAmount: 10_000,
        paidAmount: 9_999,
        outcome: 'confirmed',
        paymentKey: 'pay_credit_1',
        boundPaymentKey: null,
      }).action,
      'reject',
    );
    const closed = assessCreditCharge({
      orderAmount: 10_000,
      paidAmount: 10_000,
      outcome: 'cancelled',
      paymentKey: '',
      boundPaymentKey: null,
    });
    assert.deepEqual(closed, { action: 'close', status: 'cancelled' });
  });

  it('이미 묶인 결제 식별자가 다르면 거절한다', () => {
    const decision = assessCreditCharge({
      orderAmount: 10_000,
      paidAmount: 10_000,
      outcome: 'confirmed',
      paymentKey: 'pay_credit_2',
      boundPaymentKey: 'pay_credit_1',
    });
    assert.deepEqual(decision, { action: 'reject', code: 'PAYMENT_KEY_MISMATCH' });
  });
});
