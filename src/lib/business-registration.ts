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

export function parseBusinessIdentityInput(body: {
  businessNumber?: unknown;
  representativeName?: unknown;
  openedOn?: unknown;
} | null) {
  const businessNumber = normalizeBusinessNumber(
    typeof body?.businessNumber === 'string' ? body.businessNumber : '',
  );
  const representativeName = normalizeRepresentativeName(
    typeof body?.representativeName === 'string' ? body.representativeName : '',
  );
  const openedOn = normalizeOpeningDate(typeof body?.openedOn === 'string' ? body.openedOn : '');
  const numberError = businessNumberError(businessNumber);
  if (numberError) {
    return {
      businessNumber,
      representativeName,
      openedOn,
      error: numberError,
      errorCode: 'INVALID_NUMBER' as const,
    };
  }
  const nameError = representativeNameError(representativeName);
  if (nameError) {
    return {
      businessNumber,
      representativeName,
      openedOn,
      error: nameError,
      errorCode: 'INVALID_REPRESENTATIVE' as const,
    };
  }
  const dateError = openingDateError(openedOn);
  if (dateError) {
    return {
      businessNumber,
      representativeName,
      openedOn,
      error: dateError,
      errorCode: 'INVALID_OPENING_DATE' as const,
    };
  }
  return {
    businessNumber,
    representativeName,
    openedOn,
    error: null,
    errorCode: null,
  };
}

export function normalizeCompanyName(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 100);
}

export function companyNameError(value: string | null | undefined) {
  const name = normalizeCompanyName(value);
  if (!name) {
    return '상호명을 입력해 주세요.';
  }
  if (name.length < 2) {
    return '상호명을 2자 이상 입력해 주세요.';
  }
  return null;
}

export function normalizeBusinessAddress(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 200);
}

export function businessAddressError(value: string | null | undefined) {
  const address = normalizeBusinessAddress(value);
  if (!address) {
    return '사업장 상세 주소를 입력해 주세요.';
  }
  if (address.length < 8) {
    return '사업장 주소를 동·호수까지 입력해 주세요.';
  }
  return null;
}

export function normalizeBusinessContact(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ').slice(0, 20);
}

export function businessContactError(value: string | null | undefined) {
  const contact = normalizeBusinessContact(value);
  const digits = contact.replace(/\D/g, '');
  if (!digits) {
    return '사업자 연락처를 입력해 주세요.';
  }
  if (digits.length < 8 || digits.length > 12) {
    return '유선·대표번호·080·휴대폰 번호를 확인해 주세요.';
  }
  return null;
}

export function parseBusinessDetailInput(body: {
  companyName?: unknown;
  address?: unknown;
  contact?: unknown;
} | null) {
  const companyName = normalizeCompanyName(
    typeof body?.companyName === 'string' ? body.companyName : '',
  );
  const address = normalizeBusinessAddress(typeof body?.address === 'string' ? body.address : '');
  const contact = normalizeBusinessContact(typeof body?.contact === 'string' ? body.contact : '');
  const companyError = companyNameError(companyName);
  if (companyError) {
    return {
      companyName,
      address,
      contact,
      error: companyError,
      errorCode: 'INVALID_COMPANY_NAME' as const,
    };
  }
  const addressError = businessAddressError(address);
  if (addressError) {
    return {
      companyName,
      address,
      contact,
      error: addressError,
      errorCode: 'INVALID_ADDRESS' as const,
    };
  }
  const contactError = businessContactError(contact);
  if (contactError) {
    return {
      companyName,
      address,
      contact,
      error: contactError,
      errorCode: 'INVALID_CONTACT' as const,
    };
  }
  return {
    companyName,
    address,
    contact,
    error: null,
    errorCode: null,
  };
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

export const CAMPAIGN_BUSINESS_REQUIRED_MESSAGE =
  '사업자 인증이 완료된 계정만 캠페인을 등록할 수 있습니다.';

export const CAMPAIGN_BUSINESS_REQUIRED_NOTICE =
  '캠페인 모집 등록은 사업자 인증을 완료한 기업(사업자) 회원만 이용할 수 있습니다.';

export const TIMESLOT_BUSINESS_REQUIRED_MESSAGE =
  '사업자 인증이 완료된 계정만 크리에이터 상품을 등록할 수 있습니다.';

export const TIMESLOT_BUSINESS_REQUIRED_NOTICE =
  '크리에이터 상품 등록은 사업자 인증을 완료한 크리에이터(사업자) 회원만 이용할 수 있습니다.';

export function businessActionBlock(
  status: string | null | undefined,
  action: 'charge' | 'campaign' | 'timeslot',
) {
  const raw = status ?? '';
  const normalized: BusinessVerificationStatus = isBusinessVerificationStatus(raw)
    ? raw
    : 'unregistered';
  if (action === 'campaign' || action === 'timeslot') {
    if (normalized === 'verified') {
      return null;
    }
    return action === 'timeslot'
      ? TIMESLOT_BUSINESS_REQUIRED_MESSAGE
      : CAMPAIGN_BUSINESS_REQUIRED_MESSAGE;
  }
  if (normalized !== 'closed' && normalized !== 'rejected') {
    return null;
  }
  const label = businessVerificationLabel(normalized);
  return `사업자 상태가 ${label}이라 크레딧을 충전할 수 없습니다. 계정 설정에서 번호를 확인해 주세요.`;
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
