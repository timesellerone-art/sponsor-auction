import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { getPaymentSigningSecret } from '@/lib/payments/env';
import type { PaymentIntent, PaymentIntentStatus } from '@/types/payment';

export const PAYMENT_INTENT_COOKIE = 'sa-pay-intent';
export const PAYMENT_INTENT_TTL_MS = 30 * 60 * 1000;

const intents = new Map<string, PaymentIntent>();

function sign(value: string) {
  return createHmac('sha256', getPaymentSigningSecret()).update(value).digest('hex');
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function createOrderId() {
  return `ord_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
}

export function sanitizeCustomerKey(value: string | undefined) {
  const cleaned = (value ?? '').replace(/[^\w-]/g, '').slice(0, 50);
  return cleaned.length >= 2 ? cleaned : 'guest-advertiser';
}

export function putIntent(intent: PaymentIntent) {
  pruneExpired();
  intents.set(intent.orderId, intent);
}

export function getIntent(orderId: string) {
  pruneExpired();
  return intents.get(orderId) ?? null;
}

export function updateIntent(
  orderId: string,
  patch: Partial<Pick<PaymentIntent, 'status' | 'paymentKey' | 'method'>>,
) {
  const current = getIntent(orderId);
  if (!current) {
    return null;
  }

  const next: PaymentIntent = { ...current, ...patch };
  intents.set(orderId, next);
  return next;
}

export function encodeIntentCookie(intent: PaymentIntent) {
  const payload = Buffer.from(
    JSON.stringify({
      orderId: intent.orderId,
      auctionId: intent.auctionId,
      bidId: intent.bidId,
      amount: intent.amount,
      orderName: intent.orderName,
      createdAt: intent.createdAt,
    }),
    'utf8',
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function decodeIntentCookie(value: string | undefined): PaymentIntent | null {
  if (!value) {
    return null;
  }

  const [payload, signature] = value.split('.');
  if (!payload || !signature || !safeEqual(sign(payload), signature)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<PaymentIntent>;
    if (
      typeof parsed.orderId !== 'string' ||
      typeof parsed.auctionId !== 'string' ||
      typeof parsed.bidId !== 'string' ||
      typeof parsed.amount !== 'number' ||
      typeof parsed.orderName !== 'string' ||
      typeof parsed.createdAt !== 'number'
    ) {
      return null;
    }

    if (Date.now() - parsed.createdAt > PAYMENT_INTENT_TTL_MS) {
      return null;
    }

    return {
      orderId: parsed.orderId,
      auctionId: parsed.auctionId,
      bidId: parsed.bidId,
      amount: parsed.amount,
      orderName: parsed.orderName,
      createdAt: parsed.createdAt,
      status: 'pending',
      paymentKey: null,
    };
  } catch {
    return null;
  }
}

export function resolveIntent(orderId: string, cookieValue: string | undefined) {
  const stored = getIntent(orderId);
  if (stored && stored.orderId === orderId) {
    if (Date.now() - stored.createdAt > PAYMENT_INTENT_TTL_MS) {
      updateIntent(orderId, { status: 'expired' });
      return null;
    }
    return stored;
  }

  const fromCookie = decodeIntentCookie(cookieValue);
  if (!fromCookie || fromCookie.orderId !== orderId) {
    return null;
  }

  putIntent(fromCookie);
  return fromCookie;
}

export function isTerminalStatus(status: PaymentIntentStatus) {
  return status === 'confirmed' || status === 'failed' || status === 'expired';
}

function pruneExpired() {
  const now = Date.now();
  for (const [orderId, intent] of intents) {
    if (now - intent.createdAt > PAYMENT_INTENT_TTL_MS && intent.status === 'pending') {
      intents.delete(orderId);
    }
  }
}
