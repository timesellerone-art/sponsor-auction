import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUTH_PRESENT_COOKIE_NAME } from '../../src/lib/access';
import { postAuthPath, postSocialAuthPath } from '../../src/lib/auth-guard';
import {
  hasAuthPresence,
  isAuthCallbackPath,
  isAuthPassthroughPath,
  onboardingCanonicalPath,
} from '../../src/lib/auth-paths';

describe('auth path helpers', () => {
  it('콜백과 온보딩은 공개 통과 경로이다', () => {
    assert.equal(isAuthCallbackPath('/auth/callback'), true);
    assert.equal(isAuthPassthroughPath('/onboarding/role-select'), true);
    assert.equal(isAuthPassthroughPath('/auth/oauth'), true);
    assert.equal(isAuthPassthroughPath('/my'), false);
    assert.equal(onboardingCanonicalPath('/select-role'), '/onboarding/role-select');
    assert.equal(onboardingCanonicalPath('/onboarding'), '/onboarding/role-select');
  });

  it('Supabase 세션 쿠키 또는 auth present 쿠키를 로그인으로 본다', () => {
    assert.equal(
      hasAuthPresence([{ name: AUTH_PRESENT_COOKIE_NAME, value: '1' }]),
      true,
    );
    assert.equal(
      hasAuthPresence([{ name: 'sb-xxxx-auth-token', value: 'jwt' }]),
      true,
    );
    assert.equal(hasAuthPresence([{ name: 'other', value: '1' }]), false);
  });
});

describe('post-auth destination', () => {
  it('역할 없는 신규 유저는 온보딩으로 보낸다', () => {
    assert.equal(
      postSocialAuthPath({ roles: [] }, '/admin', { needsOnboarding: true }),
      '/onboarding/role-select',
    );
  });

  it('광고주에게 /admin next를 강제하지 않는다', () => {
    assert.equal(postAuthPath({ roles: ['advertiser'] }, '/admin'), '/my');
  });
});
