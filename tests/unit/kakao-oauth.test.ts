import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAppOAuthCallbackUrl } from '../../src/lib/auth-guard';
import {
  sanitizeKakaoAuthorizeUrl,
  sanitizeKakaoScopes,
} from '../../src/lib/kakao-oauth';

describe('Kakao KOE205 스코프 차단', () => {
  it('account_email 및 이메일 계열 스코프를 제거한다', () => {
    assert.deepEqual(
      sanitizeKakaoScopes(['profile_nickname', 'account_email', 'profile_image', 'email']),
      ['profile_nickname', 'profile_image'],
    );
  });

  it('인가 URL의 account_email을 제거하고 스코프를 추가하지 않는다', () => {
    const raw =
      'https://kauth.kakao.com/oauth/authorize?client_id=abc&redirect_uri=https://wrong.example/callback&scope=account_email+profile_nickname';
    const cleaned = sanitizeKakaoAuthorizeUrl(
      raw,
      'https://project.supabase.co/auth/v1/callback',
    );
    const parsed = new URL(cleaned);
    assert.equal(parsed.searchParams.get('scope'), 'profile_nickname');
    assert.equal(
      parsed.searchParams.get('redirect_uri'),
      'https://project.supabase.co/auth/v1/callback',
    );
    assert.equal(cleaned.includes('account_email'), false);
  });

  it('이메일 스코프만 있으면 scope 파라미터를 삭제한다', () => {
    const cleaned = sanitizeKakaoAuthorizeUrl(
      'https://kauth.kakao.com/oauth/authorize?scope=account_email,email',
    );
    const parsed = new URL(cleaned);
    assert.equal(parsed.searchParams.get('scope'), null);
  });
});

describe('OAuth 앱 콜백 URL (로컬/배포)', () => {
  it('localhost 콜백은 /auth/callback 으로 고정된다', () => {
    assert.equal(
      buildAppOAuthCallbackUrl('http://localhost:3000', '/my'),
      'http://localhost:3000/auth/callback?next=%2Fmy',
    );
  });

  it('Vercel 배포 origin도 동일한 콜백 경로를 사용한다', () => {
    assert.equal(
      buildAppOAuthCallbackUrl('https://sponsor-auction.vercel.app/', '/onboarding/role-select'),
      'https://sponsor-auction.vercel.app/auth/callback?next=%2Fonboarding%2Frole-select',
    );
  });
});
