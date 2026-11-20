export const CREDIT_CHARGE_ORDER_PREFIX = 'crd_';
export const CREDIT_CHARGE_ORDER_NAME = '클링크 크레딧 충전';
export const CREDIT_CHARGE_AMOUNTS = [10_000, 30_000, 50_000, 100_000, 300_000] as const;

export type CreditChargeAmount = (typeof CREDIT_CHARGE_AMOUNTS)[number];
export type CreditChargeOutcome = 'confirmed' | 'failed' | 'cancelled';

export type CreditChargeAssessment =
  | { action: 'charge' }
  | { action: 'close'; status: 'failed' | 'cancelled' }
  | { action: 'reject'; code: 'AMOUNT_MISMATCH' | 'PAYMENT_KEY_MISMATCH' | 'INVALID_PAYMENT' };

export function isCreditChargeAmount(amount: number): amount is CreditChargeAmount {
  return CREDIT_CHARGE_AMOUNTS.includes(amount as CreditChargeAmount);
}

export function isCreditChargeOrderId(orderId: string) {
  return orderId.trim().startsWith(CREDIT_CHARGE_ORDER_PREFIX);
}

export function demoCreditPaymentKey(orderId: string) {
  return `demo_${orderId}`;
}

export function assessCreditCharge(input: {
  orderAmount: number;
  paidAmount: number;
  outcome: CreditChargeOutcome;
  paymentKey: string;
  boundPaymentKey: string | null;
}): CreditChargeAssessment {
  if (input.outcome !== 'confirmed') {
    return { action: 'close', status: input.outcome === 'cancelled' ? 'cancelled' : 'failed' };
  }
  const paymentKey = input.paymentKey.trim();
  if (paymentKey.length < 8) {
    return { action: 'reject', code: 'INVALID_PAYMENT' };
  }
  if (!Number.isInteger(input.paidAmount) || input.paidAmount !== input.orderAmount) {
    return { action: 'reject', code: 'AMOUNT_MISMATCH' };
  }
  if (input.boundPaymentKey && input.boundPaymentKey !== paymentKey) {
    return { action: 'reject', code: 'PAYMENT_KEY_MISMATCH' };
  }
  return { action: 'charge' };
}
