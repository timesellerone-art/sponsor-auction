import { NextResponse } from 'next/server';
import { advertiserPayableAmount } from '@/lib/fees';
import { getTossClientKey, isTossClientConfigured } from '@/lib/payments/env';
import {
  PAYMENT_INTENT_COOKIE,
  PAYMENT_INTENT_TTL_MS,
  createOrderId,
  encodeIntentCookie,
  putIntent,
  sanitizeCustomerKey,
} from '@/lib/payments/intent';
import { MAX_BID_AMOUNT } from '@/lib/validation';
import { persistPayment } from '@/lib/payments/persist';
import type { PreparePaymentInput, PreparePaymentResult } from '@/types/payment';

function parseBody(value: unknown): PreparePaymentInput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as Record<string, unknown>;
  const auctionId = typeof body.auctionId === 'string' ? body.auctionId.trim() : '';
  const bidId = typeof body.bidId === 'string' ? body.bidId.trim() : '';
  const amount = typeof body.amount === 'number' ? body.amount : Number.NaN;
  const orderName = typeof body.orderName === 'string' ? body.orderName.trim() : '';
  const customerKey = typeof body.customerKey === 'string' ? body.customerKey : '';

  if (!auctionId || !bidId || !orderName || !Number.isInteger(amount)) {
    return null;
  }

  return { auctionId, bidId, amount, orderName, customerKey };
}

export async function POST(request: Request) {
  try {
    const parsed = parseBody(await request.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json(
        { error: '주문 정보가 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    if (parsed.amount < 100 || parsed.amount > MAX_BID_AMOUNT + advertiserPayableAmount(MAX_BID_AMOUNT)) {
      return NextResponse.json(
        { error: '결제 금액이 허용 범위를 벗어났습니다.' },
        { status: 400 },
      );
    }

    const intent = {
      orderId: createOrderId(),
      auctionId: parsed.auctionId,
      bidId: parsed.bidId,
      amount: parsed.amount,
      orderName: parsed.orderName.slice(0, 100),
      status: 'pending' as const,
      paymentKey: null,
      createdAt: Date.now(),
    };

    putIntent(intent);
    const pending = await persistPayment(intent, 'pending', null);
    if (!pending.ok) {
      console.error('[SponsorAuction] pending payment 저장 실패', pending);
    }

    const result: PreparePaymentResult = {
      orderId: intent.orderId,
      amount: intent.amount,
      orderName: intent.orderName,
      customerKey: sanitizeCustomerKey(parsed.customerKey),
      clientKey: getTossClientKey() || null,
      demo: !isTossClientConfigured(),
    };

    const response = NextResponse.json(result);
    response.cookies.set(PAYMENT_INTENT_COOKIE, encodeIntentCookie(intent), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(PAYMENT_INTENT_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    console.warn('[SponsorAuction] 결제 준비 중 예외가 발생했습니다.', error);
    return NextResponse.json(
      { error: '결제를 준비하지 못했습니다. 다시 시도해 주세요.' },
      { status: 500 },
    );
  }
}
