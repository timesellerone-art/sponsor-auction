import { createHmac, timingSafeEqual } from 'crypto';
import { getTossWebhookSecret } from '@/lib/payments/env';
import type { PaymentIntentStatus } from '@/types/payment';

export const TOSS_WEBHOOK_SIGNATURE_HEADER = 'tosspayments-webhook-signature';
export const TOSS_WEBHOOK_TIME_HEADER = 'tosspayments-webhook-transmission-time';

export type ParsedTossWebhook =
  | {
      kind: 'payment';
      eventType: string;
      paymentKey: string;
      orderId: string;
      status: string;
      totalAmount: number | null;
      secret: string;
    }
  | {
      kind: 'deposit';
      eventType: 'DEPOSIT_CALLBACK';
      orderId: string;
      status: string;
      secret: string;
    }
  | {
      kind: 'ignored';
      eventType: string;
    };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asAmount(value: unknown) {
  const amount = Number(value);
  return Number.isInteger(amount) && amount > 0 ? amount : null;
}

export function parseTossWebhookBody(value: unknown): ParsedTossWebhook | null {
  const body = asRecord(value);
  if (!body) {
    return null;
  }

  const eventType = asText(body.eventType) || asText(body.event_type);
  const data = asRecord(body.data) ?? body;

  if (eventType === 'DEPOSIT_CALLBACK' || (!eventType && asText(body.orderId) && asText(body.secret))) {
    const orderId = asText(body.orderId) || asText(data.orderId);
    const status = asText(body.status) || asText(data.status);
    if (!orderId) {
      return null;
    }
    return {
      kind: 'deposit',
      eventType: 'DEPOSIT_CALLBACK',
      orderId,
      status,
      secret: asText(body.secret) || asText(data.secret),
    };
  }

  if (
    eventType &&
    eventType !== 'PAYMENT_STATUS_CHANGED' &&
    eventType !== 'ORDER_PAYMENT_STATUS_CHANGED'
  ) {
    return { kind: 'ignored', eventType };
  }

  const payment =
    eventType === 'ORDER_PAYMENT_STATUS_CHANGED' ? asRecord(data.payment) ?? data : data;
  const paymentKey = asText(payment.paymentKey);
  const orderId = asText(payment.orderId);
  const status = asText(payment.status);
  if (!paymentKey || !orderId || !status) {
    return null;
  }

  return {
    kind: 'payment',
    eventType: eventType || 'PAYMENT_STATUS_CHANGED',
    paymentKey,
    orderId,
    status,
    totalAmount: asAmount(payment.totalAmount ?? payment.balanceAmount),
    secret: asText(payment.secret),
  };
}

export function mapTossPaymentStatus(status: string): PaymentIntentStatus | 'ignored' {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'DONE') {
    return 'confirmed';
  }
  if (normalized === 'EXPIRED') {
    return 'expired';
  }
  if (
    normalized === 'CANCELED' ||
    normalized === 'ABORTED' ||
    normalized === 'PARTIAL_CANCELED'
  ) {
    return 'failed';
  }
  return 'ignored';
}

function safeEqualBuffer(left: Buffer, right: Buffer) {
  if (left.length === 0 || left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function verifyTossWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret = getTossWebhookSecret(),
): { ok: boolean; skipped: boolean } {
  const signatureHeader = headers.get(TOSS_WEBHOOK_SIGNATURE_HEADER)?.trim() || '';
  if (!signatureHeader) {
    return { ok: true, skipped: true };
  }
  if (!secret) {
    return { ok: true, skipped: true };
  }

  const transmissionTime = headers.get(TOSS_WEBHOOK_TIME_HEADER)?.trim() || '';
  const digest = createHmac('sha256', secret)
    .update(`${rawBody}:${transmissionTime}`)
    .digest();

  const parts = signatureHeader.split(',').map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const encoded = part.replace(/^v1:/i, '').trim();
    if (!encoded) {
      continue;
    }
    const decoded = Buffer.from(encoded, 'base64');
    if (safeEqualBuffer(decoded, digest)) {
      return { ok: true, skipped: false };
    }
  }

  return { ok: false, skipped: false };
}
