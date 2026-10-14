import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isTossSecretConfigured } from '@/lib/payments/env';
import {
  PAYMENT_INTENT_COOKIE,
  getIntent,
  resolveIntent,
  updateIntent,
} from '@/lib/payments/intent';
import { confirmTossPayment, isDemoPaymentKey } from '@/lib/payments/toss';
import type { ConfirmPaymentInput, ConfirmPaymentResult } from '@/types/payment';

function parseBody(value: unknown): ConfirmPaymentInput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as Record<string, unknown>;
  const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey.trim() : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const amount = Number(body.amount);

  if (!paymentKey || !orderId || !Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  return { paymentKey, orderId, amount };
}

export async function POST(request: Request) {
  try {
    const parsed = parseBody(await request.json().catch(() => null));
    if (!parsed) {
      console.error('[SponsorAuction] 결제 승인 요청 본문이 올바르지 않습니다.');
      return NextResponse.json(
        {
          error: '[INVALID_CONFIRM_BODY] 결제 승인 정보가 올바르지 않습니다.',
          errorCode: 'INVALID_CONFIRM_BODY',
          errorMessage: '결제 승인 정보가 올바르지 않습니다.',
        },
        { status: 400 },
      );
    }

    console.info('[SponsorAuction] 결제 승인 요청', {
      orderId: parsed.orderId,
      amount: parsed.amount,
      paymentKeyPrefix: parsed.paymentKey.slice(0, 8),
      tossSecretConfigured: isTossSecretConfigured(),
    });

    const cookieStore = await cookies();
    const intent = resolveIntent(
      parsed.orderId,
      cookieStore.get(PAYMENT_INTENT_COOKIE)?.value,
    );

    if (!intent) {
      console.error('[SponsorAuction] 결제 승인 실패: intent 없음', {
        orderId: parsed.orderId,
        amount: parsed.amount,
      });
      return NextResponse.json(
        {
          error: '[INTENT_NOT_FOUND] 결제 요청이 만료되었거나 찾을 수 없습니다. 낙찰은 진행되지 않았습니다.',
          errorCode: 'INTENT_NOT_FOUND',
          errorMessage: '결제 요청이 만료되었거나 찾을 수 없습니다. 낙찰은 진행되지 않았습니다.',
        },
        { status: 409 },
      );
    }

    if (intent.amount !== parsed.amount) {
      console.error('[SponsorAuction] 결제 승인 실패: 금액 불일치', {
        orderId: parsed.orderId,
        requestedAmount: parsed.amount,
        intentAmount: intent.amount,
      });
      updateIntent(intent.orderId, { status: 'failed' });
      return NextResponse.json(
        {
          error: '[AMOUNT_MISMATCH] 결제 금액이 주문 정보와 일치하지 않습니다. 낙찰은 진행되지 않았습니다.',
          errorCode: 'AMOUNT_MISMATCH',
          errorMessage: '결제 금액이 주문 정보와 일치하지 않습니다. 낙찰은 진행되지 않았습니다.',
        },
        { status: 409 },
      );
    }

    const existing = getIntent(intent.orderId);
    if (existing?.status === 'confirmed') {
      if (existing.paymentKey && existing.paymentKey !== parsed.paymentKey) {
        console.error('[SponsorAuction] 결제 승인 실패: 이미 다른 paymentKey로 처리됨', {
          orderId: parsed.orderId,
        });
        return NextResponse.json(
          {
            error: '[ALREADY_CONFIRMED_OTHER_KEY] 이미 다른 결제로 처리된 주문입니다.',
            errorCode: 'ALREADY_CONFIRMED_OTHER_KEY',
            errorMessage: '이미 다른 결제로 처리된 주문입니다.',
          },
          { status: 409 },
        );
      }

      const replay: ConfirmPaymentResult = {
        orderId: intent.orderId,
        auctionId: intent.auctionId,
        bidId: intent.bidId,
        amount: intent.amount,
        paymentKey: existing.paymentKey ?? parsed.paymentKey,
        alreadyConfirmed: true,
      };
      return NextResponse.json(replay);
    }

    if (existing?.status === 'failed' || existing?.status === 'expired') {
      console.error('[SponsorAuction] 결제 승인 실패: 이미 취소/만료', {
        orderId: parsed.orderId,
        status: existing.status,
      });
      return NextResponse.json(
        {
          error: '[INTENT_NOT_PENDING] 이미 취소되었거나 만료된 결제입니다. 낙찰은 진행되지 않았습니다.',
          errorCode: 'INTENT_NOT_PENDING',
          errorMessage: '이미 취소되었거나 만료된 결제입니다. 낙찰은 진행되지 않았습니다.',
        },
        { status: 409 },
      );
    }

    const demoAllowed = !isTossSecretConfigured() && isDemoPaymentKey(parsed.paymentKey);
    if (!demoAllowed) {
      if (!isTossSecretConfigured()) {
        updateIntent(intent.orderId, { status: 'failed', paymentKey: parsed.paymentKey });
        console.error('[SponsorAuction] 결제 승인 실패: TOSS_SECRET_KEY 없음', {
          orderId: parsed.orderId,
        });
        return NextResponse.json(
          {
            error:
              '[TOSS_SECRET_KEY_MISSING] TOSS_SECRET_KEY가 없어 결제를 승인할 수 없습니다. Vercel 서버 환경 변수에 시크릿 키를 등록해 주세요.',
            errorCode: 'TOSS_SECRET_KEY_MISSING',
            errorMessage:
              'TOSS_SECRET_KEY가 없어 결제를 승인할 수 없습니다. Vercel 서버 환경 변수에 시크릿 키를 등록해 주세요.',
          },
          { status: 502 },
        );
      }

      const toss = await confirmTossPayment(parsed);
      if (!toss.ok) {
        updateIntent(intent.orderId, { status: 'failed', paymentKey: parsed.paymentKey });
        const errorCode = toss.errorCode || 'TOSS_CONFIRM_FAILED';
        const errorMessage =
          toss.errorMessage || toss.error || '결제 승인에 실패했습니다. 낙찰은 진행되지 않았습니다.';
        console.error('[SponsorAuction] Toss confirm API 거절', {
          orderId: parsed.orderId,
          amount: parsed.amount,
          errorCode,
          errorMessage,
        });
        return NextResponse.json(
          {
            error: `[${errorCode}] ${errorMessage}`,
            errorCode,
            errorMessage,
          },
          { status: 402 },
        );
      }
    }

    updateIntent(intent.orderId, {
      status: 'confirmed',
      paymentKey: parsed.paymentKey,
    });

    const result: ConfirmPaymentResult = {
      orderId: intent.orderId,
      auctionId: intent.auctionId,
      bidId: intent.bidId,
      amount: intent.amount,
      paymentKey: parsed.paymentKey,
      alreadyConfirmed: false,
    };

    console.info('[SponsorAuction] 결제 승인 완료', {
      orderId: result.orderId,
      amount: result.amount,
      demoAllowed,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[SponsorAuction] 결제 승인 중 예외가 발생했습니다.', error);
    const errorMessage =
      error instanceof Error ? error.message : '결제 승인에 실패했습니다. 낙찰은 진행되지 않았습니다.';
    return NextResponse.json(
      {
        error: `[CONFIRM_EXCEPTION] ${errorMessage}`,
        errorCode: 'CONFIRM_EXCEPTION',
        errorMessage,
      },
      { status: 500 },
    );
  }
}
