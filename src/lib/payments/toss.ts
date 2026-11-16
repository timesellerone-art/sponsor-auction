import { describeTossSecret, getTossSecretKey } from '@/lib/payments/env';

const TOSS_API_BASE = 'https://api.tosspayments.com/v1/payments';
const TOSS_CONFIRM_URL = `${TOSS_API_BASE}/confirm`;

export type TossPaymentSnapshot = {
  paymentKey: string;
  orderId: string;
  status: string;
  totalAmount: number;
  secret: string;
};

function tossAuthorization(secretKey: string) {
  return `Basic ${Buffer.from(`${secretKey}:`, 'utf8').toString('base64')}`;
}

function parseTossPaymentPayload(value: unknown): TossPaymentSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const body = value as Record<string, unknown>;
  const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey.trim() : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const status = typeof body.status === 'string' ? body.status.trim() : '';
  const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
  const totalAmount = Number(body.totalAmount ?? body.balanceAmount);
  if (!paymentKey || !orderId || !status || !Number.isInteger(totalAmount) || totalAmount <= 0) {
    return null;
  }
  return { paymentKey, orderId, status, totalAmount, secret };
}

async function tossGetJson(url: string, secretKey: string) {
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: tossAuthorization(secretKey),
    },
  });
  const rawBody = await response.text();
  let payload: unknown = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }
  return { response, rawBody, payload };
}

export type TossConfirmResult = {
  ok: boolean;
  alreadyConfirmed?: boolean;
  error?: string;
  errorCode?: string;
  errorMessage?: string;
  httpStatus?: number;
};

export async function confirmTossPayment(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossConfirmResult> {
  const secretKey = getTossSecretKey();
  if (!secretKey) {
    console.error('[SponsorAuction] Toss confirm 중단: TOSS_SECRET_KEY가 없습니다.', {
      orderId: input.orderId,
      amount: input.amount,
    });
    return {
      ok: false,
      errorCode: 'TOSS_SECRET_KEY_MISSING',
      errorMessage: '토스페이먼츠 비밀키가 설정되지 않았습니다.',
      error: '[TOSS_SECRET_KEY_MISSING] 토스페이먼츠 비밀키가 설정되지 않았습니다.',
    };
  }

  const authorization = tossAuthorization(secretKey);
  const secretMeta = describeTossSecret(secretKey);

  try {
    console.info('[SponsorAuction] Toss confirm 요청', {
      url: TOSS_CONFIRM_URL,
      orderId: input.orderId,
      amount: input.amount,
      paymentKeyPrefix: input.paymentKey.slice(0, 8),
      authorizationScheme: 'Basic',
      secretKeyKind: secretMeta.kind,
      secretKeyPrefix: secretMeta.prefix,
      secretKeyLength: secretMeta.length,
    });

    const response = await fetch(TOSS_CONFIRM_URL, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
      }),
    });

    const rawBody = await response.text();
    let payload: { code?: string; message?: string; status?: string } | null = null;
    try {
      payload = rawBody ? (JSON.parse(rawBody) as { code?: string; message?: string; status?: string }) : null;
    } catch {
      payload = null;
    }

    if (response.ok) {
      console.info('[SponsorAuction] Toss confirm 성공', {
        orderId: input.orderId,
        amount: input.amount,
        httpStatus: response.status,
        tossStatus: payload?.status,
      });
      return { ok: true, httpStatus: response.status };
    }

    if (payload?.code === 'ALREADY_PROCESSED_PAYMENT') {
      console.info('[SponsorAuction] Toss confirm 이미 처리된 결제', {
        orderId: input.orderId,
        amount: input.amount,
        httpStatus: response.status,
        errorCode: payload.code,
        errorMessage: payload.message,
      });
      return { ok: true, alreadyConfirmed: true, httpStatus: response.status };
    }

    const errorCode = payload?.code || `HTTP_${response.status}`;
    const errorMessage = payload?.message || rawBody || '토스페이먼츠 결제 승인에 실패했습니다.';
    console.error('[SponsorAuction] Toss confirm 실패', {
      orderId: input.orderId,
      amount: input.amount,
      httpStatus: response.status,
      errorCode,
      errorMessage,
      tossResponse: payload ?? rawBody,
    });
    return {
      ok: false,
      httpStatus: response.status,
      errorCode,
      errorMessage,
      error: `[${errorCode}] ${errorMessage}`,
    };
  } catch (error) {
    console.error('[SponsorAuction] 토스페이먼츠 승인 요청 중 예외가 발생했습니다.', {
      orderId: input.orderId,
      amount: input.amount,
      error,
    });
    const message = error instanceof Error ? error.message : '토스페이먼츠 결제 승인에 실패했습니다.';
    return {
      ok: false,
      errorCode: 'CONFIRM_EXCEPTION',
      errorMessage: message,
      error: `[CONFIRM_EXCEPTION] ${message}`,
    };
  }
}

export async function fetchTossPayment(
  paymentKey: string,
): Promise<{ ok: true; payment: TossPaymentSnapshot } | { ok: false; errorCode: string; httpStatus?: number }> {
  const secretKey = getTossSecretKey();
  if (!secretKey) {
    return { ok: false, errorCode: 'TOSS_SECRET_KEY_MISSING' };
  }
  const key = paymentKey.trim();
  if (!key) {
    return { ok: false, errorCode: 'NOT_FOUND_PAYMENT' };
  }

  try {
    const { response, payload } = await tossGetJson(
      `${TOSS_API_BASE}/${encodeURIComponent(key)}`,
      secretKey,
    );
    const payment = parseTossPaymentPayload(payload);
    if (!response.ok || !payment) {
      const code =
        payload && typeof payload === 'object' && typeof (payload as { code?: unknown }).code === 'string'
          ? (payload as { code: string }).code
          : `HTTP_${response.status}`;
      return { ok: false, errorCode: code, httpStatus: response.status };
    }
    return { ok: true, payment };
  } catch (error) {
    console.error('[SponsorAuction] Toss 결제 조회 예외', { paymentKeyPrefix: key.slice(0, 8), error });
    return { ok: false, errorCode: 'TOSS_LOOKUP_EXCEPTION' };
  }
}

export async function fetchTossPaymentByOrderId(
  orderId: string,
): Promise<{ ok: true; payment: TossPaymentSnapshot } | { ok: false; errorCode: string; httpStatus?: number }> {
  const secretKey = getTossSecretKey();
  if (!secretKey) {
    return { ok: false, errorCode: 'TOSS_SECRET_KEY_MISSING' };
  }
  const id = orderId.trim();
  if (!id) {
    return { ok: false, errorCode: 'NOT_FOUND_PAYMENT' };
  }

  try {
    const { response, payload } = await tossGetJson(
      `${TOSS_API_BASE}/orders/${encodeURIComponent(id)}`,
      secretKey,
    );
    const payment = parseTossPaymentPayload(payload);
    if (!response.ok || !payment) {
      const code =
        payload && typeof payload === 'object' && typeof (payload as { code?: unknown }).code === 'string'
          ? (payload as { code: string }).code
          : `HTTP_${response.status}`;
      return { ok: false, errorCode: code, httpStatus: response.status };
    }
    return { ok: true, payment };
  } catch (error) {
    console.error('[SponsorAuction] Toss 주문 조회 예외', { orderId: id, error });
    return { ok: false, errorCode: 'TOSS_LOOKUP_EXCEPTION' };
  }
}

export function isDemoPaymentKey(paymentKey: string) {
  return paymentKey.startsWith('demo_');
}
