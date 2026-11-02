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
  it('카카오계정 이메일은 유지하고 미승인 스코프만 제거한다', () => {
    assert.deepEqual(
      sanitizeKakaoScopes(['profile_nickname', 'email', 'profile_image', 'talk_message']),
      ['profile_nickname', 'account_email', 'profile_image'],
    );
  });

  it('인가 URL의 이메일을 account_email로 정규화하고 프로필을 유지한다', () => {
    const raw =
      'https://kauth.kakao.com/oauth/authorize?client_id=abc&redirect_uri=https://wrong.example/callback&scope=email+profile_nickname';
    const cleaned = sanitizeKakaoAuthorizeUrl(
      raw,
      'https://project.supabase.co/auth/v1/callback',
    );
    const parsed = new URL(cleaned);
    assert.equal(parsed.searchParams.get('scope'), 'account_email profile_nickname');
    assert.equal(
      parsed.searchParams.get('redirect_uri'),
      'https://project.supabase.co/auth/v1/callback',
    );
  });

  it('미승인 스코프만 있으면 닉네임·프로필·이메일을 요청한다', () => {
    const cleaned = sanitizeKakaoAuthorizeUrl(
      'https://kauth.kakao.com/oauth/authorize?scope=talk_message',
    );
    const parsed = new URL(cleaned);
    assert.equal(parsed.searchParams.get('scope'), kakaoOAuthScopeQuery());
  });

  it('OAuth options는 닉네임·프로필·이메일을 요청한다', () => {
    assert.equal(kakaoOAuthScopesOption(), 'profile_nickname,profile_image,account_email');
    assert.equal(kakaoOAuthScopeQuery(), 'profile_nickname profile_image account_email');
    assert.equal(/account_email/.test(kakaoOAuthScopesOption()), true);
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
