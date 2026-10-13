import { getTossSecretKey } from '@/lib/payments/env';

const TOSS_CONFIRM_URL = 'https://api.tosspayments.com/v1/payments/confirm';

export type TossConfirmResult = {
  ok: boolean;
  alreadyConfirmed?: boolean;
  error?: string;
};

export async function confirmTossPayment(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<TossConfirmResult> {
  const secretKey = getTossSecretKey();
  if (!secretKey) {
    return { ok: false, error: '토스페이먼츠 비밀키가 설정되지 않았습니다.' };
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
      return { ok: true };
    }

    if (payload?.code === 'ALREADY_PROCESSED_PAYMENT') {
      return { ok: true, alreadyConfirmed: true };
    }

    return {
      ok: false,
      error: payload?.message || '토스페이먼츠 결제 승인에 실패했습니다.',
    };
  } catch (error) {
    console.warn('[SponsorAuction] 토스페이먼츠 승인 요청 중 예외가 발생했습니다.', error);
    return { ok: false, error: '토스페이먼츠 결제 승인에 실패했습니다.' };
  }
}

export function isDemoPaymentKey(paymentKey: string) {
  return paymentKey.startsWith('demo_');
}
