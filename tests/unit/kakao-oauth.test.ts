import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAppOAuthCallbackUrl } from '../../src/lib/auth-guard';
import {
  kakaoOAuthScopeQuery,
  kakaoOAuthScopesOption,
  sanitizeKakaoAuthorizeUrl,
  sanitizeKakaoScopes,
} from '../../src/lib/kakao-oauth';

describe('Kakao 이메일 동의 스코프', () => {
  it('미승인 이메일·메시지 스코프는 제거하고 프로필만 남긴다', () => {
    assert.deepEqual(
      sanitizeKakaoScopes(['profile_nickname', 'email', 'profile_image', 'talk_message']),
      ['profile_nickname', 'profile_image'],
    );
  });

  it('인가 URL에서 account_email을 빼고 프로필만 요청한다', () => {
    const raw =
      'https://kauth.kakao.com/oauth/authorize?client_id=abc&redirect_uri=https://wrong.example/callback&scope=email+profile_nickname';
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
  });

  it('미승인 스코프만 있으면 닉네임·프로필만 요청한다', () => {
    const cleaned = sanitizeKakaoAuthorizeUrl(
      'https://kauth.kakao.com/oauth/authorize?scope=talk_message+account_email',
    );
    const parsed = new URL(cleaned);
    assert.equal(parsed.searchParams.get('scope'), kakaoOAuthScopeQuery());
  });

  it('OAuth options는 닉네임·프로필만 요청한다', () => {
    assert.equal(kakaoOAuthScopesOption(), 'profile_nickname,profile_image');
    assert.equal(kakaoOAuthScopeQuery(), 'profile_nickname profile_image');
    assert.equal(/account_email/.test(kakaoOAuthScopesOption()), false);
    assert.equal(/talk_message/.test(kakaoOAuthScopesOption()), false);
  });
});

describe('OAuth 앱 콜백 URL (로컬/배포)', () => {
  it('localhost 콜백은 쿼리 없는 /auth/callback 으로 고정된다', () => {
    assert.equal(
      buildAppOAuthCallbackUrl('http://localhost:3000'),
      'http://localhost:3000/auth/callback',
    );
  });

  it('Vercel 배포 origin도 동일한 콜백 경로를 사용한다', () => {
    assert.equal(
      buildAppOAuthCallbackUrl('https://sponsor-auction.vercel.app/'),
      'https://sponsor-auction.vercel.app/auth/callback',
    );
  });
});
