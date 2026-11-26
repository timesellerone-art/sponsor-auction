import {
  isValidBusinessRegistrationNumber,
  normalizeBusinessNumber,
  normalizeOpeningDate,
  normalizeRepresentativeName,
  openingDateError,
  representativeNameError,
} from '@/lib/business-registration';

const DEFAULT_STATUS_ENDPOINT = 'https://api.odcloud.kr/api/nts-businessman/v1/status';
const DEFAULT_VALIDATE_ENDPOINT = 'https://api.odcloud.kr/api/nts-businessman/v1/validate';

export type NtsBusinessCode = '01' | '02' | '03';
export type NtsBusinessKind = NtsBusinessCode | 'UNREGISTERED';
export type NtsValidateCode = '01' | '02';

export type NtsBusinessLookup =
  | {
      ok: true;
      code: NtsBusinessKind;
      label: string;
      businessNumber: string;
    }
  | {
      ok: false;
      code: 'UNCONFIGURED' | 'INVALID_NUMBER' | 'LOOKUP_FAILED';
      message: string;
    };

export type NtsBusinessValidate =
  | {
      ok: true;
      valid: NtsValidateCode;
      matched: boolean;
      message: string;
      businessNumber: string;
    }
  | {
      ok: false;
      code: 'UNCONFIGURED' | 'INVALID_NUMBER' | 'INVALID_INPUT' | 'LOOKUP_FAILED';
      message: string;
    };

export function ntsBusinessApiKey() {
  return decodedServiceKey(
    process.env.NTS_BUSINESS_API_KEY || process.env.DATA_GO_KR_SERVICE_KEY || '',
  );
}

export function ntsBusinessApiEndpoint() {
  return (process.env.NTS_BUSINESS_API_URL || DEFAULT_STATUS_ENDPOINT).trim() || DEFAULT_STATUS_ENDPOINT;
}

export function ntsBusinessValidateEndpoint() {
  const override = (process.env.NTS_BUSINESS_VALIDATE_URL || '').trim();
  if (override) {
    return override;
  }
  const statusUrl = ntsBusinessApiEndpoint();
  if (statusUrl.includes('/status')) {
    return statusUrl.replace(/\/status\/?$/, '/validate');
  }
  return DEFAULT_VALIDATE_ENDPOINT;
}

function decodedServiceKey(raw: string) {
  let key = raw.trim();
  for (let index = 0; index < 2; index += 1) {
    if (!/%[0-9A-Fa-f]{2}/.test(key)) {
      break;
    }
    try {
      const next = decodeURIComponent(key);
      if (next === key) {
        break;
      }
      key = next;
    } catch {
      break;
    }
  }
  return key;
}

function asRecord(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function codeOf(value: unknown): NtsBusinessCode | null {
  const code = String(value ?? '').trim();
  if (code === '01' || code === '02' || code === '03') {
    return code;
  }
  return null;
}

function labelOf(code: NtsBusinessCode, raw: unknown) {
  const text = String(raw ?? '').trim();
  if (text) {
    return text;
  }
  if (code === '01') {
    return '계속사업자';
  }
  if (code === '02') {
    return '휴업자';
  }
  return '폐업자';
}

function classifyRow(row: Record<string, unknown> | null): {
  code: NtsBusinessKind;
  label: string;
} | null {
  if (!row) {
    return null;
  }
  const statusText = String(row.b_stt ?? '').trim();
  const taxType = String(row.tax_type ?? '').trim();
  const combined = `${statusText} ${taxType}`;
  if (/등록되지 않은|미등록/.test(combined)) {
    return { code: 'UNREGISTERED', label: '미등록' };
  }
  const code = codeOf(row.b_stt_cd);
  if (code) {
    return { code, label: labelOf(code, statusText) };
  }
  if (/계속사업/.test(statusText)) {
    return { code: '01', label: '계속사업자' };
  }
  if (/휴업/.test(statusText)) {
    return { code: '02', label: '휴업자' };
  }
  if (/폐업/.test(statusText)) {
    return { code: '03', label: '폐업자' };
  }
  return null;
}

function parseJsonBody(text: string) {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function missingKeyMessage() {
  return '국세청 사업자 조회 키가 없습니다. NTS_BUSINESS_API_KEY(또는 DATA_GO_KR_SERVICE_KEY)를 서버 환경변수에 등록해 주세요.';
}

async function postNts(
  endpoint: string,
  payload: unknown,
  failedPrefix: string,
): Promise<
  | { ok: true; record: Record<string, unknown> }
  | { ok: false; code: 'UNCONFIGURED' | 'LOOKUP_FAILED'; message: string }
> {
  const key = ntsBusinessApiKey();
  if (!key) {
    return { ok: false, code: 'UNCONFIGURED', message: missingKeyMessage() };
  }

  const url = new URL(endpoint);
  url.searchParams.set('serviceKey', key);
  url.searchParams.set('returnType', 'JSON');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const text = await response.text();
    const body = parseJsonBody(text);
    const record = asRecord(body) ?? {};
    const statusCode = String(record.status_code ?? '').trim().toUpperCase();
    const hint = String(record.status_msg ?? record.msg ?? '').trim();
    if (!response.ok) {
      return {
        ok: false,
        code: 'LOOKUP_FAILED',
        message: hint ? `${failedPrefix} ${hint}` : `${failedPrefix} (${response.status})`,
      };
    }
    if (statusCode && statusCode !== 'OK') {
      return {
        ok: false,
        code: 'LOOKUP_FAILED',
        message: `${failedPrefix} ${hint || statusCode}`,
      };
    }
    return { ok: true, record };
  } catch {
    return {
      ok: false,
      code: 'LOOKUP_FAILED',
      message: `${failedPrefix} 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.`,
    };
  }
}

export async function lookupNtsBusinessStatus(
  businessNumber: string,
): Promise<NtsBusinessLookup> {
  const digits = normalizeBusinessNumber(businessNumber);
  if (!isValidBusinessRegistrationNumber(digits)) {
    return {
      ok: false,
      code: 'INVALID_NUMBER',
      message:
        digits.length === 10
          ? '유효하지 않은 사업자등록번호입니다. 번호를 다시 확인해 주세요.'
          : '사업자등록번호 10자리가 필요합니다.',
    };
  }

  const posted = await postNts(
    ntsBusinessApiEndpoint(),
    { b_no: [digits] },
    '국세청 사업자 상태 조회에 실패했습니다.',
  );
  if (!posted.ok) {
    return posted;
  }
  const rows = Array.isArray(posted.record.data) ? posted.record.data : [];
  const classified = classifyRow(asRecord(rows[0]));
  if (!classified) {
    return {
      ok: true,
      code: 'UNREGISTERED',
      label: '미등록',
      businessNumber: digits,
    };
  }
  return {
    ok: true,
    code: classified.code,
    label: classified.label,
    businessNumber: digits,
  };
}

export function ntsValidateMismatchMessage(validMsg = '') {
  const hint = validMsg.trim();
  if (hint && !/확인되었습니다/.test(hint)) {
    return `국세청 등록 정보와 일치하지 않습니다. ${hint} 대표자 성명과 개업일자(YYYYMMDD)를 다시 확인해 주세요.`;
  }
  return '대표자 성명 또는 개업일자가 국세청 등록 정보와 일치하지 않습니다. 상호명이 아닌 대표자 성명과 개업일자(YYYYMMDD)를 확인해 주세요.';
}

export async function validateNtsBusinessIdentity(input: {
  businessNumber: string;
  representativeName: string;
  openedOn: string;
}): Promise<NtsBusinessValidate> {
  const digits = normalizeBusinessNumber(input.businessNumber);
  if (!isValidBusinessRegistrationNumber(digits)) {
    return {
      ok: false,
      code: 'INVALID_NUMBER',
      message:
        digits.length === 10
          ? '유효하지 않은 사업자등록번호입니다. 번호를 다시 확인해 주세요.'
          : '사업자등록번호 10자리가 필요합니다.',
    };
  }
  const name = normalizeRepresentativeName(input.representativeName);
  const nameError = representativeNameError(name);
  if (nameError) {
    return { ok: false, code: 'INVALID_INPUT', message: nameError };
  }
  const openedOn = normalizeOpeningDate(input.openedOn);
  const dateError = openingDateError(openedOn);
  if (dateError) {
    return { ok: false, code: 'INVALID_INPUT', message: dateError };
  }

  const posted = await postNts(
    ntsBusinessValidateEndpoint(),
    {
      businesses: [
        {
          b_no: digits,
          start_dt: openedOn,
          p_nm: name,
        },
      ],
    },
    '국세청 사업자등록정보 진위확인에 실패했습니다.',
  );
  if (!posted.ok) {
    return posted;
  }

  const rows = Array.isArray(posted.record.data) ? posted.record.data : [];
  const row = asRecord(rows[0]);
  const validRaw = String(row?.valid ?? '').trim();
  const valid: NtsValidateCode = validRaw === '01' ? '01' : '02';
  const validMsg = String(row?.valid_msg ?? '').trim();
  const matched = valid === '01';
  return {
    ok: true,
    valid,
    matched,
    message: matched
      ? validMsg || '국세청 등록 정보와 일치합니다.'
      : ntsValidateMismatchMessage(validMsg),
    businessNumber: digits,
  };
}
