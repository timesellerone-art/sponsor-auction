import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAppOAuthCallbackUrl } from '../../src/lib/auth-guard';
import { naverCallbackUrl } from '../../src/lib/naver-oauth';
import {
  authCookieDomain,
  canonicalAppOrigin,
  PRODUCTION_SITE_ORIGIN,
  publicAppOrigin,
  requestAppOrigin,
} from '../../src/lib/site-origin';

describe('운영 도메인 origin / 쿠키', () => {
  it('www와 apex를 모두 https://www.clinkapp.kr 로 맞춘다', () => {
    assert.equal(canonicalAppOrigin('https://www.clinkapp.kr'), PRODUCTION_SITE_ORIGIN);
    assert.equal(canonicalAppOrigin('https://clinkapp.kr'), PRODUCTION_SITE_ORIGIN);
    assert.equal(canonicalAppOrigin('http://clinkapp.kr'), PRODUCTION_SITE_ORIGIN);
    assert.equal(canonicalAppOrigin('http://localhost:3000'), 'http://localhost:3000');
  });

  it('운영 Host 헤더에서도 카카오/구글/네이버 redirect_uri가 www 기준이다', () => {
    const origin = requestAppOrigin({
      url: 'http://127.0.0.1:3000/login',
      headers: new Headers({
        host: 'www.clinkapp.kr',
        'x-forwarded-host': 'www.clinkapp.kr',
        'x-forwarded-proto': 'https',
      }),
    });
    assert.equal(origin, PRODUCTION_SITE_ORIGIN);
    assert.equal(buildAppOAuthCallbackUrl(origin), `${PRODUCTION_SITE_ORIGIN}/auth/callback`);
    assert.equal(naverCallbackUrl(origin), `${PRODUCTION_SITE_ORIGIN}/api/auth/naver/callback`);

    const apex = requestAppOrigin({
      url: 'http://127.0.0.1:3000/api/auth/naver',
      headers: new Headers({
        host: 'clinkapp.kr',
        'x-forwarded-host': 'clinkapp.kr',
        'x-forwarded-proto': 'https',
      }),
    });
    assert.equal(apex, PRODUCTION_SITE_ORIGIN);
    assert.equal(naverCallbackUrl(apex), `${PRODUCTION_SITE_ORIGIN}/api/auth/naver/callback`);
  });

  it('운영 호스트에서만 Domain=.clinkapp.kr 를 붙인다', () => {
    assert.equal(authCookieDomain('www.clinkapp.kr'), '.clinkapp.kr');
    assert.equal(authCookieDomain('clinkapp.kr'), '.clinkapp.kr');
    assert.equal(authCookieDomain('localhost'), undefined);
  });

  it('서버 public origin은 SITE_URL이 있으면 정규화한다', () => {
    const previous = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = 'https://clinkapp.kr';
    assert.equal(publicAppOrigin(), PRODUCTION_SITE_ORIGIN);
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  });
});
