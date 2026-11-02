import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isNaverIdentityProvider,
  readNaverIdpState,
  readNaverIdpTicket,
  signNaverIdpState,
  signNaverIdpTicket,
} from '../../src/lib/naver-idp';

process.env.NAVER_CLIENT_ID ??= 'test-naver-id';
process.env.NAVER_CLIENT_SECRET ??= 'test-naver-secret';

describe('네이버 GoTrue IdP 티켓', () => {
  it('네이버 provider 식별자를 인식한다', () => {
    assert.equal(isNaverIdentityProvider('naver'), true);
    assert.equal(isNaverIdentityProvider('custom:naver'), true);
    assert.equal(isNaverIdentityProvider('google'), false);
  });

  it('state와 profile 티켓을 서명하고 검증한다', () => {
    const state = signNaverIdpState({
      s: 'gothrue-state',
      r: 'https://jatmkycmvboyniafqzeg.supabase.co/auth/v1/callback',
      o: 'http://localhost:3000',
    });
    assert.deepEqual(readNaverIdpState(state), {
      s: 'gothrue-state',
      r: 'https://jatmkycmvboyniafqzeg.supabase.co/auth/v1/callback',
      o: 'http://localhost:3000',
    });
    assert.equal(readNaverIdpState('tampered'), null);

    const ticket = signNaverIdpTicket({
      id: 'naver-1',
      email: 'user@example.com',
      name: '홍길동',
      phone: '01012345678',
      avatarUrl: null,
    });
    const parsed = readNaverIdpTicket(ticket);
    assert.equal(parsed?.sub, 'naver-1');
    assert.equal(parsed?.email, 'user@example.com');
    assert.equal(parsed?.name, '홍길동');
  });
});
