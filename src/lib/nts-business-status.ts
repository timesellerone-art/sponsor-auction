import { normalizeBusinessNumber } from '@/lib/business-registration';

const DEFAULT_ENDPOINT = 'https://api.odcloud.kr/api/nts-businessman/v1/status';

export type NtsBusinessCode = '01' | '02' | '03';

export type NtsBusinessLookup =
  | {
      ok: true;
      code: NtsBusinessCode;
      label: string;
      businessNumber: string;
    }
  | {
      ok: false;
      code: 'UNCONFIGURED' | 'INVALID_NUMBER' | 'NOT_FOUND' | 'LOOKUP_FAILED';
      message: string;
    };

export function ntsBusinessApiKey() {
  return (process.env.NTS_BUSINESS_API_KEY || process.env.DATA_GO_KR_SERVICE_KEY || '').trim();
}

export function ntsBusinessApiEndpoint() {
  return (process.env.NTS_BUSINESS_API_URL || DEFAULT_ENDPOINT).trim() || DEFAULT_ENDPOINT;
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

export async function lookupNtsBusinessStatus(
  businessNumber: string,
): Promise<NtsBusinessLookup> {
  const digits = normalizeBusinessNumber(businessNumber);
  if (digits.length !== 10) {
    return { ok: false, code: 'INVALID_NUMBER', message: '사업자등록번호 10자리가 필요합니다.' };
  }
  const key = ntsBusinessApiKey();
  if (!key) {
    return {
      ok: false,
      code: 'UNCONFIGURED',
      message:
        '국세청 사업자 상태 조회 키가 없습니다. NTS_BUSINESS_API_KEY(또는 DATA_GO_KR_SERVICE_KEY)를 서버 환경변수에 등록해 주세요.',
    };
  }

  const url = new URL(ntsBusinessApiEndpoint());
  url.searchParams.set('serviceKey', key);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ b_no: [digits] }),
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    });
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      return {
        ok: false,
        code: 'LOOKUP_FAILED',
        message: `국세청 사업자 상태 조회에 실패했습니다. (${response.status})`,
      };
    }
    const record = asRecord(body);
    const rows = Array.isArray(record?.data) ? record.data : [];
    const row = asRecord(rows[0]);
    const code = codeOf(row?.b_stt_cd);
    if (!row || !code) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        message: '국세청에서 해당 사업자등록번호의 상태를 찾지 못했습니다.',
      };
    }
    return {
      ok: true,
      code,
      label: labelOf(code, row.b_stt),
      businessNumber: digits,
    };
  } catch {
    return {
      ok: false,
      code: 'LOOKUP_FAILED',
      message: '국세청 사업자 상태 조회에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    };
  }
}
