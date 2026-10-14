import { getTossSecretKey } from '@/lib/payments/env';

const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

export type TossConfirmResult = {
  ok: boolean;
  alreadyConfirmed?: boolean;
  error?: string;
  errorCode?: string;
  errorMessage?: string;
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

  const authorization = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;

  try {
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

    const payload = (await response.json().catch(() => null)) as {
      code?: string;
      message?: string;
      status?: string;
    } | null;

    if (response.ok) {
      console.info('[SponsorAuction] Toss confirm 성공', {
        orderId: input.orderId,
        amount: input.amount,
        status: payload?.status ?? response.status,
      });
      return { ok: true };
    }

    if (payload?.code === 'ALREADY_PROCESSED_PAYMENT') {
      console.info('[SponsorAuction] Toss confirm 이미 처리된 결제', {
        orderId: input.orderId,
        amount: input.amount,
      });
      return { ok: true, alreadyConfirmed: true };
    }

    const errorCode = payload?.code || `HTTP_${response.status}`;
    const errorMessage = payload?.message || '토스페이먼츠 결제 승인에 실패했습니다.';
    console.error('[SponsorAuction] Toss confirm 실패', {
      orderId: input.orderId,
      amount: input.amount,
      httpStatus: response.status,
      errorCode,
      errorMessage,
    });
    return {
      ok: false,
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

export function isDemoPaymentKey(paymentKey: string) {
  return paymentKey.startsWith('demo_');
}
