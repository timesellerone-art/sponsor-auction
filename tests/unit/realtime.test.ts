import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  REALTIME_MAX_RETRIES,
  canSubscribeRealtime,
  isRealtimeSessionReady,
  parseRealtimePayload,
  realtimeRetryDelayMs,
} from '../../src/lib/realtime';

describe('Realtime 구독 가드', () => {
  it('데모 계정과 비 UUID는 구독하지 않는다', () => {
    assert.equal(canSubscribeRealtime('usr-demo-advertiser', 'brand@demo.com'), false);
    assert.equal(canSubscribeRealtime('not-a-uuid', 'user@example.com'), false);
    assert.equal(
      canSubscribeRealtime('244a0386-1111-4111-8111-244a03861111', 'user@example.com'),
      true,
    );
  });

  it('유효한 세션 토큰이 있을 때만 준비된 것으로 본다', () => {
    assert.equal(
      isRealtimeSessionReady({
        userId: '244a0386-1111-4111-8111-244a03861111',
        email: 'user@example.com',
        accessToken: '',
      }),
      false,
    );
    assert.equal(
      isRealtimeSessionReady({
        userId: '244a0386-1111-4111-8111-244a03861111',
        email: 'user@example.com',
        accessToken: 'jwt-token',
      }),
      true,
    );
  });

  it('재시도 대기는 지수적으로 늘고 상한을 넘지 않는다', () => {
    assert.equal(realtimeRetryDelayMs(0), 1000);
    assert.equal(realtimeRetryDelayMs(1), 2000);
    assert.equal(realtimeRetryDelayMs(2), 4000);
    assert.equal(realtimeRetryDelayMs(5), 8000);
    assert.equal(REALTIME_MAX_RETRIES, 3);
  });

  it('허용된 테이블 payload만 파싱한다', () => {
    assert.equal(parseRealtimePayload({ table: 'profiles', eventType: 'INSERT', new: { id: '1' } }), null);
    const change = parseRealtimePayload({
      table: 'bids',
      eventType: 'UPDATE',
      new: { id: 'bid-1' },
      old: { id: 'bid-1' },
    });
    assert.equal(change?.table, 'bids');
    assert.equal(change?.eventType, 'UPDATE');
  });
});
