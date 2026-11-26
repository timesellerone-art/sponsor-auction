import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  existingAccountLoginMessage,
  isProvisionalSignupUser,
  needsPhoneOnboarding,
  signupMethodLabels,
} from '../../src/lib/phone-signup';

describe('phone signup uniqueness', () => {
  it('기존 계정의 소셜 수단을 한국어로 안내한다', () => {
    assert.deepEqual(
      signupMethodLabels({
        email: 'user@example.com',
        identities: [{ provider: 'kakao' }],
      }),
      ['카카오', '이메일'],
    );
    assert.equal(
      existingAccountLoginMessage(['카카오']),
      '이미 카카오로 가입된 회원입니다. 기존 계정으로 로그인해 주세요.',
    );
    assert.equal(
      existingAccountLoginMessage(['네이버', '구글']),
      '이미 네이버, 구글로 가입된 회원입니다. 기존 계정으로 로그인해 주세요.',
    );
  });

  it('미인증 임시 소셜 세션만 휴대폰 온보딩 대상이다', () => {
    assert.equal(needsPhoneOnboarding({ id: 'usr-1', roles: [] }), true);
    assert.equal(needsPhoneOnboarding({ id: 'usr-1', roles: [], phoneVerified: true }), false);
    assert.equal(needsPhoneOnboarding({ id: 'usr-1', roles: ['advertiser'] }), false);
    assert.equal(needsPhoneOnboarding({ roles: [] }), false);
    assert.equal(
      isProvisionalSignupUser({ user_metadata: { onboarding_complete: true } }),
      false,
    );
    assert.equal(isProvisionalSignupUser({ user_metadata: {} }), true);
  });
});
