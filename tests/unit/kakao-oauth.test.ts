import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAppOAuthCallbackUrl } from '../../src/lib/auth-guard';
import {
  kakaoOAuthScopeQuery,
  kakaoOAuthScopesOption,
  sanitizeKakaoAuthorizeUrl,
  sanitizeKakaoScopes,
} from '../../src/lib/kakao-oauth';

describe('Kakao KOE205 스코프 차단', () => {
  it('이메일 계열 스코프를 제거하고 닉네임·프로필만 남긴다', () => {
    assert.deepEqual(
      sanitizeKakaoScopes(['profile_nickname', 'email', 'profile_image', 'talk_message']),
      ['profile_nickname', 'profile_image'],
    );
  });

  it('인가 URL의 이메일 스코프를 제거하고 프로필 스코프만 유지한다', () => {
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
    assert.equal(/email/i.test(parsed.searchParams.get('scope') ?? ''), false);
  });

  it('이메일 스코프만 있으면 닉네임·프로필 기본 스코프로 교체한다', () => {
    const cleaned = sanitizeKakaoAuthorizeUrl(
      'https://kauth.kakao.com/oauth/authorize?scope=email,talk_message',
    );
    const parsed = new URL(cleaned);
    assert.equal(parsed.searchParams.get('scope'), kakaoOAuthScopeQuery());
  });

  it('OAuth options는 닉네임과 프로필 이미지만 요청한다', () => {
    assert.equal(kakaoOAuthScopesOption(), 'profile_nickname,profile_image');
    assert.equal(kakaoOAuthScopeQuery(), 'profile_nickname profile_image');
    assert.equal(/email/i.test(kakaoOAuthScopesOption()), false);
    assert.equal(/email/i.test(kakaoOAuthScopeQuery()), false);
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
