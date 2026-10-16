export const TERMS_REQUIRED = '서비스 이용약관에 동의해 주세요.';
export const PRIVACY_REQUIRED = '개인정보처리방침에 동의해 주세요.';
export const REFUND_REQUIRED = '구매 조건 확인 및 환불 규정에 동의해 주세요.';
export const SIGNUP_AGREEMENT_REQUIRED =
  '서비스 이용약관 및 개인정보 처리방침에 동의해 주세요.';

export function validateAgreements(input: {
  agreeTerms: boolean;
  agreePrivacy: boolean;
}) {
  const errors: { agreeTerms?: string; agreePrivacy?: string } = {};
  if (!input.agreeTerms) {
    errors.agreeTerms = TERMS_REQUIRED;
  }
  if (!input.agreePrivacy) {
    errors.agreePrivacy = PRIVACY_REQUIRED;
  }
  return errors;
}

export function validateSignupAgreement(agreed: boolean) {
  return agreed ? {} : { agreeTerms: SIGNUP_AGREEMENT_REQUIRED, agreePrivacy: SIGNUP_AGREEMENT_REQUIRED };
}

export function validateRefundAgreement(agreed: boolean) {
  return agreed ? null : REFUND_REQUIRED;
}
