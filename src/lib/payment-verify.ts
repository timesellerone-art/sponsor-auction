export const PAYMENT_VERIFY_COOKIE = 'sa-pay-verify';
export const PAYMENT_VERIFY_AMOUNTS = [100, 1000] as const;
export const PAYMENT_VERIFY_DEFAULT_AMOUNT = 1000;
export const PAYMENT_VERIFY_ORDER_PREFIX = 'pvr_';
export const PAYMENT_VERIFY_PRODUCT_NAME = '클링크 광고주 캠페인 예치금 테스트 결제';
export const PAYMENT_VERIFY_CUSTOMER_KEY = 'pg-reviewer';
export const PAYMENT_VERIFY_SERVICE_PERIOD =
  '결제 승인 후 즉시 디지털 매칭 이용 권한이 부여되며, 검수 목적의 테스트 결제는 납품이 없는 한 전액 환불됩니다.';

export type PaymentVerifyAmount = (typeof PAYMENT_VERIFY_AMOUNTS)[number];

export function isPaymentVerifyAmount(value: number): value is PaymentVerifyAmount {
  return PAYMENT_VERIFY_AMOUNTS.includes(value as PaymentVerifyAmount);
}

export function isPaymentVerifyOrderId(orderId: string) {
  return orderId.startsWith(PAYMENT_VERIFY_ORDER_PREFIX);
}
