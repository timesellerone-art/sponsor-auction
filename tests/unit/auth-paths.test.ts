import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUTH_PRESENT_COOKIE_NAME } from '../../src/lib/access';
import { describeOAuthError, postAuthPath, postSocialAuthPath } from '../../src/lib/auth-guard';
import {
  expirePkceVerifierCookies,
  hasAuthPresence,
  isAuthCallbackPath,
  isAuthDebrisCookieName,
  isAuthPassthroughPath,
  isPkceVerifierCookieName,
  isSupabaseAuthCookieName,
  onboardingCanonicalPath,
  sessionCookieOptions,
  shouldApplyRequestCookie,
  writeCookies,
} from '../../src/lib/auth-paths';
import { resolveActiveMemberRole, switchableMemberRoles } from '../../src/types/auth';

describe('auth path helpers', () => {
  it('콜백과 온보딩은 공개 통과 경로이다', () => {
    assert.equal(isAuthCallbackPath('/auth/callback'), true);
    assert.equal(isAuthCallbackPath('/api/auth/naver/callback'), true);
    assert.equal(isAuthCallbackPath('/api/auth/session/complete'), true);
    assert.equal(isAuthPassthroughPath('/onboarding/role-select'), true);
    assert.equal(isAuthPassthroughPath('/auth/oauth'), true);
    assert.equal(isAuthPassthroughPath('/my'), false);
    assert.equal(onboardingCanonicalPath('/select-role'), '/onboarding/role-select');
    assert.equal(onboardingCanonicalPath('/onboarding'), '/onboarding/role-select');
    assert.match(
      describeOAuthError('Invalid scope: account_email'),
      /카카오 로그인 동의 항목/,
    );
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

  it('역할 전환은 쿠키/선택 값을 세션 재조회 없이 유지한다', () => {
    assert.equal(
      resolveActiveMemberRole({ roles: ['advertiser', 'creator'] }, 'creator'),
      'creator',
    );
    assert.equal(
      resolveActiveMemberRole({ roles: ['advertiser', 'creator'] }, 'advertiser'),
      'advertiser',
    );
  });

  it('온보딩 완료 후에는 광고주/크리에이터 모드를 전환할 수 있다', () => {
    assert.deepEqual(switchableMemberRoles({ roles: ['advertiser'] }), [
      'advertiser',
      'creator',
    ]);
  });

  it('Supabase 세션 쿠키 옵션을 그대로 보존해 응답에 기록한다', () => {
    assert.equal(isSupabaseAuthCookieName('sb-access-token'), true);
    assert.equal(isSupabaseAuthCookieName('sb-xxxx-auth-token'), true);
    const written: Array<{ name: string; options?: { path?: string; httpOnly?: boolean } }> = [];
    writeCookies({ set: (name, _value, options) => written.push({ name, options }) }, [
      { name: 'sb-xxxx-auth-token', value: 'jwt', options: { sameSite: 'lax', maxAge: 60 } },
    ]);
    assert.equal(written[0]?.options?.path, '/');
    assert.notEqual(written[0]?.options?.httpOnly, true);
  });

  it('진행 중인 PKCE verifier는 쓰레기로 지우지 않고 예전 병합 쿠키만 만료한다', () => {
    assert.equal(isAuthDebrisCookieName('sb-xxxx-auth-token-code-verifier'), false);
    assert.equal(isAuthDebrisCookieName('sponsor-auction-merge-from'), true);
    assert.equal(isAuthDebrisCookieName('sb-xxxx-auth-token'), false);
  });

  it('OAuth 시작 시 남는 PKCE verifier 쿠키는 로그인 상태로 보지 않는다', () => {
    assert.equal(isSupabaseAuthCookieName('sb-xxxx-auth-token.0'), true);
    assert.equal(isSupabaseAuthCookieName('sb-xxxx-auth-token-code-verifier'), false);
    assert.equal(isSupabaseAuthCookieName('sb-xxxx-auth-token-flow-ab12-code-verifier'), false);
    assert.equal(isSupabaseAuthCookieName('sb-xxxx-auth-token-flows-code-verifier'), false);
    assert.equal(
      hasAuthPresence([{ name: 'sb-xxxx-auth-token-code-verifier', value: 'verifier' }]),
      false,
    );
    assert.equal(shouldApplyRequestCookie('sb-xxxx-auth-token', ''), false);
    assert.equal(shouldApplyRequestCookie('sb-xxxx-auth-token', 'jwt'), true);
    assert.equal(shouldApplyRequestCookie('sb-xxxx-auth-token-code-verifier', ''), true);
    assert.equal(isPkceVerifierCookieName('sb-xxxx-auth-token-code-verifier'), true);
    const expired: string[] = [];
    expirePkceVerifierCookies(
      {
        cookies: {
          getAll: () => [
            { name: 'sb-xxxx-auth-token-code-verifier' },
            { name: 'sb-xxxx-auth-token' },
          ],
        },
      },
      {
        cookies: {
          set: (name) => {
            expired.push(name);
          },
        },
      },
    );
    assert.deepEqual(expired, ['sb-xxxx-auth-token-code-verifier']);
  });

  it('https 응답의 세션 쿠키에는 Secure와 SameSite=Lax를 명시한다', () => {
    const written: Array<{ options?: { secure?: boolean; sameSite?: string } }> = [];
    writeCookies(
      { set: (_name, _value, options) => written.push({ options }) },
      [{ name: 'sb-xxxx-auth-token', value: 'jwt' }],
      { secure: true },
    );
    assert.equal(written[0]?.options?.secure, true);
    assert.equal(written[0]?.options?.sameSite, 'lax');
    const options = sessionCookieOptions(true);
    assert.equal(options.path, '/');
    assert.equal(options.sameSite, 'lax');
    assert.equal(options.secure, true);
    assert.equal('maxAge' in options, false);
  });
});
