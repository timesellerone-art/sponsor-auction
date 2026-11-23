export const BUSINESS_VERIFICATION_STATUSES = [
  'unregistered',
  'verified',
  'closed',
  'review_required',
  'rejected',
] as const;

export type BusinessVerificationStatus = (typeof BUSINESS_VERIFICATION_STATUSES)[number];

const STATUS_LABEL: Record<BusinessVerificationStatus, string> = {
  unregistered: '미등록',
  verified: '검증완료',
  closed: '휴폐업',
  review_required: '검수필요',
  rejected: '반려',
};

const WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5];

export function normalizeBusinessNumber(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '').slice(0, 10);
}

export function formatBusinessNumber(value: string | null | undefined) {
  const digits = normalizeBusinessNumber(value);
  if (digits.length !== 10) {
    return digits;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function isBusinessVerificationStatus(value: string): value is BusinessVerificationStatus {
  return (BUSINESS_VERIFICATION_STATUSES as readonly string[]).includes(value);
}

export function businessVerificationLabel(status: BusinessVerificationStatus) {
  return STATUS_LABEL[status];
}

export function isValidBusinessRegistrationNumber(value: string | null | undefined) {
  const digits = normalizeBusinessNumber(value);
  if (digits.length !== 10) {
    return false;
  }
  const numbers = digits.split('').map((item) => Number(item));
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += numbers[index] * WEIGHTS[index];
  }
  sum += Math.floor((numbers[8] * 5) / 10);
  const check = (10 - (sum % 10)) % 10;
  return check === numbers[9];
}

export function businessNumberError(value: string | null | undefined) {
  const digits = normalizeBusinessNumber(value);
  if (!digits) {
    return '사업자등록번호를 입력해 주세요.';
  }
  if (digits.length !== 10 || !isValidBusinessRegistrationNumber(digits)) {
    return '사업자등록번호 10자리를 확인해 주세요.';
  }
  return null;
}

export type CreatorTaxKind = 'individual' | 'business';

/** 사업자등록번호 보유 또는 검증완료면 사업자 세무(원천징수 없음), 그 외는 개인. */
export function creatorTaxKind(input: {
  businessVerificationStatus?: string | null;
  businessRegistrationNumber?: string | null;
}): CreatorTaxKind {
  const raw = input.businessVerificationStatus ?? '';
  if (isBusinessVerificationStatus(raw) && raw === 'verified') {
    return 'business';
  }
  if (isValidBusinessRegistrationNumber(input.businessRegistrationNumber)) {
    return 'business';
  }
  return 'individual';
}

export function businessActionBlock(
  status: string | null | undefined,
  action: 'charge' | 'campaign',
) {
  const raw = status ?? '';
  const normalized: BusinessVerificationStatus = isBusinessVerificationStatus(raw)
    ? raw
    : 'unregistered';
  if (normalized !== 'closed' && normalized !== 'rejected') {
    return null;
  }
  const label = businessVerificationLabel(normalized);
  if (action === 'charge') {
    return `사업자 상태가 ${label}이라 크레딧을 충전할 수 없습니다. 계정 설정에서 번호를 확인해 주세요.`;
  }
  return `사업자 상태가 ${label}이라 캠페인을 등록할 수 없습니다. 계정 설정에서 번호를 확인해 주세요.`;
}

export function profileStatusFromNts(code: '01' | '02' | '03', label: string) {
  if (code === '01') {
    return {
      status: 'review_required' as const,
      detail: `${label}. 관리자 검수가 필요합니다.`,
    };
  }
  return {
    status: 'closed' as const,
    detail: `${label}로 확인되었습니다.`,
  };
}

export function businessStatusNotice(status: BusinessVerificationStatus, detail = '') {
  if (status === 'verified') {
    return '사업자 인증이 완료되었습니다.';
  }
  if (status === 'review_required') {
    return detail || '사업자등록번호를 저장했습니다. 관리자 검수 후 인증이 완료됩니다.';
  }
  if (status === 'closed') {
    return detail || '휴업 또는 폐업 상태로 확인되어 충전과 캠페인 등록이 제한됩니다.';
  }
  if (status === 'rejected') {
    return detail || '사업자 검수가 반려되었습니다. 번호를 다시 확인한 뒤 저장해 주세요.';
  }
  return '광고주 충전과 캠페인 등록 전에 계정 설정에서 사업자등록번호를 등록해 주세요.';
}
