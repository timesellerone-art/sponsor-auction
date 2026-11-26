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
  if (digits.length !== 10) {
    return '사업자등록번호 10자리를 확인해 주세요.';
  }
  if (!isValidBusinessRegistrationNumber(digits)) {
    return '유효하지 않은 사업자등록번호입니다. 번호를 다시 확인해 주세요.';
  }
  return null;
}

export function normalizeRepresentativeName(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 50);
}

export function representativeNameError(value: string | null | undefined) {
  const name = normalizeRepresentativeName(value);
  if (!name) {
    return '대표자 성명을 입력해 주세요.';
  }
  if (name.length < 2) {
    return '대표자 성명을 2자 이상 입력해 주세요.';
  }
  return null;
}

export function normalizeOpeningDate(value: string | null | undefined) {
  return (value ?? '').replace(/\D/g, '').slice(0, 8);
}

export function formatOpeningDateInput(value: string | null | undefined) {
  const digits = normalizeOpeningDate(value);
  if (digits.length !== 8) {
    return digits;
  }
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

export function openingDateError(value: string | null | undefined) {
  const digits = normalizeOpeningDate(value);
  if (!digits) {
    return '개업일자를 입력해 주세요.';
  }
  if (digits.length !== 8) {
    return '개업일자는 YYYYMMDD 형식으로 입력해 주세요.';
  }
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return '개업일자가 올바른 날짜가 아닙니다.';
  }
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (digits < '19000101' || date.getTime() > end.getTime()) {
    return '개업일자를 다시 확인해 주세요.';
  }
  return null;
}

export type CreatorTaxKind = 'individual' | 'business';

/**
 * 세무 분기: 저장한 정산 유형이 있으면 그대로 쓴다.
 * 유형이 없으면 사업자등록번호 **검증완료(verified)** 만 사업자.
 */
export function creatorTaxKind(input: {
  settlementType?: string | null;
  businessVerificationStatus?: string | null;
  businessRegistrationNumber?: string | null;
}): CreatorTaxKind {
  if (input.settlementType === 'business' || input.settlementType === 'individual') {
    return input.settlementType;
  }
  const raw = input.businessVerificationStatus ?? '';
  if (isBusinessVerificationStatus(raw) && raw === 'verified') {
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

export function ntsBusinessLabelFromText(value: string | null | undefined) {
  const text = value ?? '';
  if (/계속사업/.test(text)) {
    return '계속사업자';
  }
  if (/휴업/.test(text)) {
    return '휴업자';
  }
  if (/폐업/.test(text)) {
    return '폐업자';
  }
  if (/미등록|등록되지 않은/.test(text)) {
    return '미등록';
  }
  if (/일치하지/.test(text)) {
    return '불일치';
  }
  return '';
}

export function profileStatusFromNts(
  code: '01' | '02' | '03' | 'UNREGISTERED',
  label: string,
) {
  if (code === 'UNREGISTERED') {
    return {
      status: 'unregistered' as const,
      detail: '미등록. 국세청에 등록되지 않은 사업자등록번호입니다.',
      ntsLabel: '미등록',
    };
  }
  if (code === '01') {
    return {
      status: 'review_required' as const,
      detail: `${label}. 관리자 검수가 필요합니다.`,
      ntsLabel: label || '계속사업자',
    };
  }
  return {
    status: 'closed' as const,
    detail: `${label}로 확인되었습니다.`,
    ntsLabel: label || (code === '02' ? '휴업자' : '폐업자'),
  };
}

/** 진위확인이 일치(valid=01)일 때만 기존 status 매핑(검수필요/휴폐업)을 적용한다. */
export function profileStatusFromNtsAndValidate(
  statusCode: '01' | '02' | '03' | 'UNREGISTERED',
  statusLabel: string,
  valid: '01' | '02',
  mismatchMessage = '',
) {
  if (valid !== '01') {
    return {
      status: 'unregistered' as const,
      detail:
        mismatchMessage ||
        '대표자 성명 또는 개업일자가 국세청 등록 정보와 일치하지 않습니다. 상호명이 아닌 대표자 성명과 개업일자(YYYYMMDD)를 확인해 주세요.',
      ntsLabel: '불일치',
      mismatch: true as const,
    };
  }
  return { ...profileStatusFromNts(statusCode, statusLabel), mismatch: false as const };
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
  return (
    detail ||
    '광고주 충전과 캠페인 등록 전에 계정 설정에서 사업자등록번호를 등록해 주세요.'
  );
}
