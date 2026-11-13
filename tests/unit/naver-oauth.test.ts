import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  buildNaverAuthorizeUrl,
  cookieOptions,
  createNaverState,
  getNaverOAuthEnv,
  missingNaverOAuthEnvKeys,
  parseNaverProfilePayload,
  shouldAcceptNaverOAuthCallback,
} from '../../src/lib/naver-oauth';
import { isOAuthStateLost } from '../../src/lib/auth-guard';

const KEYS = [
  'NAVER_CLIENT_ID',
  'NAVER_CLIENT_SECRET',
  'NEXT_PUBLIC_NAVER_CLIENT_ID',
  'NAVER_SECRET',
  'AUTH_NAVER_CLIENT_ID',
  'AUTH_NAVER_SECRET',
  'SUPABASE_AUTH_EXTERNAL_NAVER_CLIENT_ID',
  'SUPABASE_AUTH_EXTERNAL_NAVER_SECRET',
  'NAVER_ID',
  'NAVER_CLIENT_SECRET_KEY',
] as const;

const original = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of KEYS) {
    const value = original[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

function clearNaverEnv() {
  for (const key of KEYS) {
    delete process.env[key];
  }
}

describe('네이버 OAuth 환경변수', () => {
  it('표준 키를 읽는다', () => {
    clearNaverEnv();
    process.env.NAVER_CLIENT_ID = 'y4kW0zBJCewRYyWibzH2';
    process.env.NAVER_CLIENT_SECRET = 'runtime-secret';
    const env = getNaverOAuthEnv();
    assert.equal(env?.clientId, 'y4kW0zBJCewRYyWibzH2');
    assert.equal(env?.clientSecret, 'runtime-secret');
    assert.deepEqual(missingNaverOAuthEnvKeys(), []);
  });

  it('Vercel/Supabase 별칭과 따옴표 감싼 값도 읽는다', () => {
    clearNaverEnv();
    process.env.NEXT_PUBLIC_NAVER_CLIENT_ID = '"alias-client-id"';
    process.env.SUPABASE_AUTH_EXTERNAL_NAVER_SECRET = "'alias-secret'";
    const env = getNaverOAuthEnv();
    assert.equal(env?.clientId, 'alias-client-id');
    assert.equal(env?.clientSecret, 'alias-secret');
  });

  it('placeholder 값은 없는 것으로 본다', () => {
    clearNaverEnv();
    process.env.NAVER_CLIENT_ID = 'YOUR_NAVER_CLIENT_ID';
    process.env.NAVER_CLIENT_SECRET = 'YOUR_NAVER_CLIENT_SECRET_HERE';
    assert.equal(getNaverOAuthEnv(), null);
    assert.deepEqual(missingNaverOAuthEnvKeys(), ['NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET']);
  });

  it('프로필에서 이메일과 휴대전화(E.164·국내번호)를 정규화한다', () => {
    const profile = parseNaverProfilePayload({
      resultcode: '00',
      response: {
        id: 'naver-sub-1',
        email: 'shared@example.com',
        name: '네이버회원',
        mobile: '010-5555-1234',
      },
    });
    assert.equal(profile.email, 'shared@example.com');
    assert.equal(profile.phone, '01055551234');

    const fromE164 = parseNaverProfilePayload({
      resultcode: '00',
      response: {
        id: 'naver-sub-2',
        mobile_e164: '+821055551234',
      },
    });
    assert.equal(fromE164.email, 'naver.naver-sub-2@oauth.sponsor-auction.local');
    assert.equal(fromE164.phone, '01055551234');
  });

  it('state는 Web Crypto로 만들고 매번 다르다', () => {
    const left = createNaverState();
    const right = createNaverState();
    assert.notEqual(left, right);
    assert.match(left, /^[A-Za-z0-9_-]+$/);
    assert.ok(left.length >= 24);
  });

  it('인가 URL은 구글·카카오처럼 바로 로그인 창이 뜨도록 재인증을 강제하지 않는다', () => {
    const url = new URL(
      buildNaverAuthorizeUrl({
        clientId: 'y4kW0zBJCewRYyWibzH2',
        redirectUri: 'https://sponsor-auction-eta.vercel.app/api/auth/naver/callback',
        state: 'abc',
      }),
    );
    assert.equal(url.origin + url.pathname, 'https://nid.naver.com/oauth2.0/authorize');
    assert.equal(url.searchParams.get('client_id'), 'y4kW0zBJCewRYyWibzH2');
    assert.equal(url.searchParams.get('auth_type'), null);
  });

  it('state 쿠키는 SameSite=Lax, Path=/, Secure(https)로 심는다', () => {
    const httpsCookies = cookieOptions(true);
    assert.equal(httpsCookies.sameSite, 'lax');
    assert.equal(httpsCookies.path, '/');
    assert.equal(httpsCookies.secure, true);
    assert.equal(httpsCookies.maxAge, 10 * 60);
    assert.equal(httpsCookies.domain, undefined);
    assert.equal(cookieOptions(false).secure, false);
    assert.equal(cookieOptions(true, 'www.clinkapp.kr').domain, '.clinkapp.kr');
    assert.equal(cookieOptions(true, 'clinkapp.kr').domain, '.clinkapp.kr');
  });

  it('state 쿠키가 없어도 URL의 code·state면 콜백을 받는다', () => {
    assert.equal(
      shouldAcceptNaverOAuthCallback({
        code: 'naver-code',
        state: 'url-state',
        expectedState: '',
        signedIdp: false,
      }),
      true,
    );
    assert.equal(
      shouldAcceptNaverOAuthCallback({
        code: 'naver-code',
        state: 'url-state',
        expectedState: 'other-state',
        signedIdp: false,
      }),
      false,
    );
    assert.equal(
      shouldAcceptNaverOAuthCallback({
        code: 'naver-code',
        state: 'idp-state',
        expectedState: '',
        signedIdp: true,
      }),
      true,
    );
    assert.equal(
      shouldAcceptNaverOAuthCallback({
        code: '',
        state: 'url-state',
        expectedState: '',
        signedIdp: false,
      }),
      false,
    );
  });

  it('PKCE verifier 유실은 재시도 가능한 OAuth 상태 손실로 본다', () => {
    assert.equal(isOAuthStateLost(null, 'invalid code verifier'), true);
    assert.equal(isOAuthStateLost('bad_oauth_state', ''), true);
    assert.equal(isOAuthStateLost(null, 'invalid grant'), false);
  });
});
