export const TERMS_REQUIRED = '서비스 이용약관에 동의해 주세요.';
export const PRIVACY_REQUIRED = '개인정보처리방침에 동의해 주세요.';

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
