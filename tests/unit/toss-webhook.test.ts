import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  mapTossPaymentStatus,
  parseTossWebhookBody,
  TOSS_WEBHOOK_SIGNATURE_HEADER,
  TOSS_WEBHOOK_TIME_HEADER,
  verifyTossWebhookSignature,
} from '../../src/lib/payments/toss-webhook';
import { shouldRateLimitPath } from '../../src/lib/rate-limit';

describe('toss webhook parser', () => {
  it('PAYMENT_STATUS_CHANGED 본문을 파싱한다', () => {
    const event = parseTossWebhookBody({
      eventType: 'PAYMENT_STATUS_CHANGED',
      createdAt: '2026-11-16T00:00:00.000000',
      data: {
        paymentKey: 'pay_live_abc',
        orderId: 'ord_test_1',
        status: 'DONE',
        totalAmount: 115000,
      },
    });
    assert.equal(event?.kind, 'payment');
    if (event?.kind === 'payment') {
      assert.equal(event.orderId, 'ord_test_1');
      assert.equal(event.totalAmount, 115000);
      assert.equal(event.status, 'DONE');
    }
  });

  it('DEPOSIT_CALLBACK과 기타 이벤트는 구분한다', () => {
    const deposit = parseTossWebhookBody({
      eventType: 'DEPOSIT_CALLBACK',
      orderId: 'ord_va_1',
      status: 'DONE',
      secret: 'sec_va',
    });
    assert.equal(deposit?.kind, 'deposit');
    const ignored = parseTossWebhookBody({
      eventType: 'payout.changed',
      data: {},
    });
    assert.equal(ignored?.kind, 'ignored');
  });

  it('Toss 상태를 로컬 결제 상태로 매핑한다', () => {
    assert.equal(mapTossPaymentStatus('DONE'), 'confirmed');
    assert.equal(mapTossPaymentStatus('EXPIRED'), 'expired');
    assert.equal(mapTossPaymentStatus('CANCELED'), 'failed');
    assert.equal(mapTossPaymentStatus('IN_PROGRESS'), 'ignored');
  });
});

describe('toss webhook signature', () => {
  it('서명 헤더가 없으면 조회 API 검증으로 넘긴다', () => {
    const result = verifyTossWebhookSignature('{}', new Headers(), 'webhook-secret');
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
  });

  it('HMAC SHA-256 서명이 일치할 때만 통과한다', () => {
    const rawBody = '{"eventType":"PAYMENT_STATUS_CHANGED"}';
    const time = '2026-11-16T04:00:00.000000';
    const secret = 'unit-toss-webhook-secret';
    const digest = createHmac('sha256', secret).update(`${rawBody}:${time}`).digest('base64');
    const headers = new Headers({
      [TOSS_WEBHOOK_SIGNATURE_HEADER]: `v1:${digest}`,
      [TOSS_WEBHOOK_TIME_HEADER]: time,
    });
    const ok = verifyTossWebhookSignature(rawBody, headers, secret);
    const denied = verifyTossWebhookSignature(rawBody, headers, 'wrong-secret');
    assert.equal(ok.ok, true);
    assert.equal(ok.skipped, false);
    assert.equal(denied.ok, false);
  });
});

describe('toss webhook rate limit', () => {
  it('Toss 웹훅 경로는 재전송을 막지 않도록 제외한다', () => {
    assert.equal(shouldRateLimitPath('/api/webhooks/toss'), false);
    assert.equal(shouldRateLimitPath('/api/webhooks/supabase'), true);
  });
});
