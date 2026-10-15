export type PaymentErrorKind = 'cancel' | 'fail' | 'aborted';

export type PaymentErrorInfo = {
  code: string;
  message: string;
  hint: string;
  kind: PaymentErrorKind;
  cancelled: boolean;
  aborted: boolean;
};

const CANCEL_CODES = new Set([
  'USER_CANCEL',
  'PAY_PROCESS_CANCELED',
  'PAY_PROCESS_ABORTED',
  'CANCELED',
  'CANCELLED',
  'PAY_WINDOW_CLOSED',
]);

const HINTS: Record<string, string> = {
  USER_CANCEL: '결제창에서 취소하셨습니다. 캠페인과 제안은 그대로이며 다시 결제할 수 있습니다.',
  PAY_PROCESS_CANCELED: '결제가 취소되었습니다. 낙찰은 진행되지 않았습니다.',
  PAY_PROCESS_ABORTED: '결제 진행이 중단되었습니다. 인증을 마치지 않거나 창을 닫으면 이 메시지가 나타납니다.',
  PAY_WINDOW_CLOSED: '결제창이 닫혀 결과를 받지 못했습니다. 다시 시도해 주세요.',
  NEED_AGREEMENT_WITH_REQUIRED_TERMS: '토스 결제 위젯의 필수 약관에 동의한 뒤 다시 결제해 주세요.',
  REJECT_CARD_COMPANY: '카드사에서 결제를 거절했습니다. 잔액·한도·카드 상태를 확인해 주세요.',
  REJECT_CARD_PAYMENT: '카드 결제가 거절되었습니다. 잔액 부족이나 한도 초과일 수 있습니다.',
  NOT_ENOUGH_BALANCE: '잔액이 부족합니다. 다른 결제 수단으로 다시 시도해 주세요.',
  CARD_PROCESSING_ERROR: '카드 결제 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  INVALID_CARD_NUMBER: '카드 번호가 올바르지 않습니다.',
  INVALID_CARD_EXPIRATION: '카드 유효기간이 올바르지 않습니다.',
  INVALID_STOPPED_CARD: '정지된 카드입니다. 다른 카드로 시도해 주세요.',
  INVALID_PASSWORD: '비밀번호가 올바르지 않습니다.',
  INCORRECT_SECURITY_CODE: '보안코드(CVC)가 올바르지 않습니다.',
  NOT_AVAILABLE_CARD: '사용할 수 없는 카드입니다.',
  EXCEED_MAX_CARD_INSTALLMENT_PLAN: '할부 개월 수가 허용 범위를 넘었습니다.',
  NOT_SUPPORTED_INSTALLMENT_PLAN: '해당 할부는 지원되지 않습니다.',
  REJECT_ACCOUNT_PAYMENT: '계좌 결제가 거절되었습니다. 잔액과 계좌 상태를 확인해 주세요.',
  INVALID_ACCOUNT_INFO: '계좌 정보가 올바르지 않습니다.',
  NOT_AVAILABLE_BANK: '이용할 수 없는 은행입니다.',
  EXCEED_MAX_ONE_DAY_WITHDRAW_AMOUNT: '하루 출금 한도를 초과했습니다.',
  BELOW_MINIMUM_AMOUNT: '결제 금액이 최소 금액보다 작습니다.',
  EXCEED_MAX_AMOUNT: '결제 금액이 최대 허용 금액을 초과했습니다.',
  NOT_FOUND_PAYMENT: '결제 정보를 찾지 못했습니다. 다시 시작해 주세요.',
  NOT_FOUND_PAYMENT_SESSION: '결제 세션이 만료되었습니다. 다시 시작해 주세요.',
  ALREADY_PROCESSED_PAYMENT: '이미 처리된 결제입니다.',
  UNAUTHORIZED_KEY: '토스페이먼츠 클라이언트 키가 올바르지 않습니다.',
  FORBIDDEN_REQUEST: '이 가맹점에서 허용되지 않은 요청입니다.',
  INVALID_REQUEST: '결제 요청 값이 올바르지 않습니다. 주문번호·금액·URL을 확인해 주세요.',
  NOT_SUPPORTED_METHOD: '선택한 결제 수단은 현재 사용할 수 없습니다.',
  PROVIDER_ERROR: '결제사(토스페이먼츠) 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
  FDS_ERROR: '이상 거래로 결제가 차단되었습니다.',
  TOSS_SECRET_KEY_MISSING: '서버에 TOSS_SECRET_KEY가 없어 승인을 완료할 수 없습니다.',
  INTENT_NOT_FOUND: '결제 세션이 만료되었거나 서버가 주문을 찾지 못했습니다.',
  AMOUNT_MISMATCH: '승인 금액이 주문 금액과 다릅니다.',
  INVALID_SUCCESS_PARAMS: '결제 성공 URL 파라미터가 올바르지 않습니다.',
};

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

function asText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
}

function collectProps(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  const bag: Record<string, unknown> = { ...record };

  try {
    for (const key of Object.getOwnPropertyNames(value as object)) {
      bag[key] = record[key];
    }
  } catch {
    // ignore non-inspectable hosts
  }

  for (const key of ['code', 'errorCode', 'message', 'errorMessage', 'error', 'cause', 'name', 'data']) {
    if (key in record && bag[key] === undefined) {
      bag[key] = record[key];
    }
  }

  return bag;
}

function pickCode(bag: Record<string, unknown>): string {
  const direct = asText(bag.code) || asText(bag.errorCode);
  if (direct) {
    return direct;
  }

  const nested = collectProps(bag.error);
  const fromNested = asText(nested.code) || asText(nested.errorCode);
  if (fromNested) {
    return fromNested;
  }

  const data = collectProps(bag.data);
  return asText(data.code) || asText(data.errorCode);
}

function pickMessage(bag: Record<string, unknown>, error: unknown): string {
  const direct =
    asText(bag.message) ||
    asText(bag.errorMessage) ||
    asText(collectProps(bag.error).message) ||
    asText(collectProps(bag.data).message);
  if (direct) {
    return direct;
  }
  if (error instanceof Error && error.message) {
    return error.message.trim();
  }
  if (typeof error === 'string') {
    return error.trim();
  }
  return '';
}

function parseBracketCode(message: string): { code: string; message: string } | null {
  const matched = message.match(/^\[([A-Z][A-Z0-9_]{2,})\]\s*([\s\S]*)$/);
  if (!matched) {
    return null;
  }
  return { code: matched[1], message: matched[2].trim() };
}

function inferCancel(code: string, message: string) {
  return (
    CANCEL_CODES.has(code) ||
    /USER_CANCEL|PAY_PROCESS_CANCELED|PAY_PROCESS_ABORTED/i.test(code) ||
    /(결제.?취소|사용자가 취소|창을 닫|canceled|cancelled)/i.test(message)
  );
}

export function serializePaymentError(error: unknown) {
  if (error == null) {
    return { value: error };
  }
  if (typeof error !== 'object') {
    return { value: error };
  }
  return collectProps(error);
}

export function parsePaymentError(error: unknown): PaymentErrorInfo {
  if (error == null) {
    return {
      code: 'PAY_WINDOW_CLOSED',
      message: '결제창이 닫혀 응답을 받지 못했습니다.',
      hint: HINTS.PAY_WINDOW_CLOSED,
      kind: 'cancel',
      cancelled: true,
      aborted: false,
    };
  }

  const bag = collectProps(error);
  let code = pickCode(bag);
  let message = pickMessage(bag, error);

  if (!code && message.startsWith('{')) {
    try {
      const parsed = JSON.parse(message) as unknown;
      const nested = collectProps(parsed);
      code = pickCode(nested);
      message = pickMessage(nested, parsed) || message;
    } catch {
      // keep original message
    }
  }

  const bracket = parseBracketCode(message);
  if (bracket) {
    code = code || bracket.code;
    message = bracket.message || message;
  }

  const name = error instanceof Error ? error.name : asText(bag.name);
  const aborted =
    name === 'AbortError' ||
    /aborted|document is unloaded|the operation was aborted/i.test(`${code} ${message}`);
  const cancelled = inferCancel(code, message) && !aborted;

  if (!code) {
    code = aborted ? 'ABORTED' : cancelled ? 'USER_CANCEL' : 'PAYMENT_REQUEST_FAILED';
  }
  if (!message) {
    message = cancelled
      ? '결제를 취소했습니다.'
      : aborted
        ? '결제 요청이 중단되었습니다.'
        : '결제 요청에 실패했습니다.';
  }

  const kind: PaymentErrorKind = aborted ? 'aborted' : cancelled ? 'cancel' : 'fail';
  const hint = HINTS[code] || (cancelled ? HINTS.USER_CANCEL : '아래 오류 코드를 확인한 뒤 다시 시도해 주세요.');

  return { code, message, hint, kind, cancelled, aborted };
}

export function formatPaymentError(info: PaymentErrorInfo) {
  return `[${info.code}] ${info.message}`;
}

export function formatPaymentToast(info: PaymentErrorInfo) {
  const title = info.kind === 'cancel' ? '결제를 취소했습니다' : '결제에 실패했습니다';
  return {
    title,
    variant: (info.kind === 'cancel' ? 'info' : 'error') as 'info' | 'error',
    text: `${title}\n[${info.code}] ${info.message}\n${info.hint}`,
  };
}
