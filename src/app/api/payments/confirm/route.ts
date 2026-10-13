import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isTossConfigured } from '@/lib/payments/env';
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
      return NextResponse.json(
        { error: '결제 승인 정보가 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    const cookieStore = await cookies();
    const intent = resolveIntent(
      parsed.orderId,
      cookieStore.get(PAYMENT_INTENT_COOKIE)?.value,
    );

    if (!intent) {
      return NextResponse.json(
        { error: '결제 요청이 만료되었거나 찾을 수 없습니다. 낙찰은 진행되지 않았습니다.' },
        { status: 409 },
      );
    }

    if (intent.amount !== parsed.amount) {
      updateIntent(intent.orderId, { status: 'failed' });
      return NextResponse.json(
        { error: '결제 금액이 주문 정보와 일치하지 않습니다. 낙찰은 진행되지 않았습니다.' },
        { status: 409 },
      );
    }

    const existing = getIntent(intent.orderId);
    if (existing?.status === 'confirmed') {
      if (existing.paymentKey && existing.paymentKey !== parsed.paymentKey) {
        return NextResponse.json(
          { error: '이미 다른 결제로 처리된 주문입니다.' },
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
      return NextResponse.json(
        { error: '이미 취소되었거나 만료된 결제입니다. 낙찰은 진행되지 않았습니다.' },
        { status: 409 },
      );
    }

    const demoAllowed = !isTossConfigured() && isDemoPaymentKey(parsed.paymentKey);
    if (!demoAllowed) {
      const toss = await confirmTossPayment(parsed);
      if (!toss.ok) {
        updateIntent(intent.orderId, { status: 'failed', paymentKey: parsed.paymentKey });
        return NextResponse.json(
          { error: toss.error ?? '결제 승인에 실패했습니다. 낙찰은 진행되지 않았습니다.' },
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

    return NextResponse.json(result);
  } catch (error) {
    console.warn('[SponsorAuction] 결제 승인 중 예외가 발생했습니다.', error);
    return NextResponse.json(
      { error: '결제 승인에 실패했습니다. 낙찰은 진행되지 않았습니다.' },
      { status: 500 },
    );
  }
}
