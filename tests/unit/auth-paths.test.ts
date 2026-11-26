import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AUTH_COOKIE_MAX_AGE, AUTH_PRESENT_COOKIE_NAME, lastCookieValue } from '../../src/lib/access';
import { describeOAuthError, postAuthPath, postSocialAuthPath } from '../../src/lib/auth-guard';
import {
  expirePkceVerifierCookies,
  hasAuthPresence,
  isAuthCallbackPath,
  isAuthDebrisCookieName,
  isAuthPassthroughPath,
  isPkceVerifierCookieName,
  isSupabaseAuthCookieName,
  needsProtectedAuthValidation,
  onboardingCanonicalPath,
  sessionCookieOptions,
  shouldApplyRequestCookie,
  writeCookies,
} from '../../src/lib/auth-paths';
import { isAdmin, resolveActiveMemberRole, switchableMemberRoles } from '../../src/types/auth';

describe('auth path helpers', () => {
  it('콜백과 온보딩은 공개 통과 경로이다', () => {
    assert.equal(isAuthCallbackPath('/auth/callback'), true);
    assert.equal(isAuthCallbackPath('/api/auth/naver/callback'), true);
    assert.equal(isAuthCallbackPath('/api/auth/session/complete'), true);
    assert.equal(isAuthPassthroughPath('/onboarding/role-select'), true);
    assert.equal(isAuthPassthroughPath('/auth/oauth'), true);
    assert.equal(isAuthPassthroughPath('/my'), false);
    assert.equal(needsProtectedAuthValidation('/'), false);
    assert.equal(needsProtectedAuthValidation('/login'), false);
    assert.equal(needsProtectedAuthValidation('/my'), true);
    assert.equal(needsProtectedAuthValidation('/admin/users'), true);
    assert.equal(needsProtectedAuthValidation('/payments/checkout'), true);
    assert.equal(onboardingCanonicalPath('/select-role'), '/onboarding');
    assert.equal(onboardingCanonicalPath('/onboarding'), null);
    assert.equal(onboardingCanonicalPath('/onboarding/role-select'), '/onboarding');
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
  it('역할 없는 신규 유저도 홈으로 보낸다', () => {
    assert.equal(postSocialAuthPath({ roles: [] }, '/admin'), '/');
    assert.equal(postAuthPath({ roles: [] }), '/');
  });

  it('휴대폰 미인증 소셜 세션은 온보딩으로 보낸다', () => {
    assert.equal(postSocialAuthPath({ id: 'usr-new', roles: [] }, '/#auctions'), '/onboarding');
    assert.equal(
      postSocialAuthPath({ id: 'usr-new', roles: [], phoneVerified: true }, '/#auctions'),
      '/#auctions',
    );
    assert.equal(
      postSocialAuthPath({ id: 'usr-old', roles: ['advertiser'] }, '/my'),
      '/my',
    );
  });

  it('역할이 있는 기존 회원도 온보딩 next를 무시하고 홈으로 보낸다', () => {
    assert.equal(postSocialAuthPath({ roles: ['advertiser'] }, '/onboarding/role-select'), '/');
    assert.equal(postSocialAuthPath({ roles: ['creator'] }, '/onboarding'), '/');
    assert.equal(postSocialAuthPath({ roles: ['admin'] }, '/onboarding/role-select'), '/');
  });

  it('광고주에게 /admin next를 강제하지 않는다', () => {
    assert.equal(postAuthPath({ roles: ['advertiser'] }, '/admin'), '/');
  });

  it('관리자 메뉴는 admin 역할일 때만 허용한다', () => {
    assert.equal(isAdmin(null), false);
    assert.equal(isAdmin({ roles: ['advertiser'] }), false);
    assert.equal(isAdmin({ roles: ['creator'], email: 'user@example.com' }), false);
    assert.equal(isAdmin({ roles: ['admin'] }), true);
    assert.equal(isAdmin({ role: 'admin', roles: ['admin'], email: 'ops@example.com' }), true);
    assert.equal(postAuthPath({ roles: ['admin'] }, '/admin'), '/admin');
  });

  it('로그인 성공 시 유효한 next가 있으면 그 경로로 보낸다', () => {
    assert.equal(postSocialAuthPath({ roles: [] }, '/#auctions'), '/#auctions');
    assert.equal(postSocialAuthPath({ roles: ['advertiser'] }, '/my'), '/my');
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

  it('같은 이름 쿠키가 겹치면 나중에 기록된 모드를 사용한다', () => {
    assert.equal(
      lastCookieValue(
        'sponsor-auction-active-role=creator; sponsor-auction-active-role=advertiser',
        'sponsor-auction-active-role',
      ),
      'advertiser',
    );
    assert.equal(
      lastCookieValue('sponsor-auction-active-role=creator', 'sponsor-auction-active-role'),
      'creator',
    );
  });

  it('로그인한 회원은 저장된 역할과 별도로 광고주 모드를 유지한다', () => {
    assert.deepEqual(switchableMemberRoles({ id: 'user-1', roles: [] }), [
      'advertiser',
      'creator',
    ]);
    assert.equal(
      resolveActiveMemberRole({ id: 'user-1', roles: ['creator'] }, 'advertiser'),
      'advertiser',
    );
    assert.equal(resolveActiveMemberRole({ id: 'user-1', roles: [] }, 'advertiser'), 'advertiser');
    assert.equal(resolveActiveMemberRole({ id: 'user-1', roles: [] }), 'advertiser');
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
    assert.equal(options.maxAge, AUTH_COOKIE_MAX_AGE);
    assert.equal(options.domain, undefined);
    const production = sessionCookieOptions(true, 'www.clinkapp.kr');
    assert.equal(production.domain, '.clinkapp.kr');
    assert.equal(sessionCookieOptions(true, 'clinkapp.kr').domain, '.clinkapp.kr');
  });
});
