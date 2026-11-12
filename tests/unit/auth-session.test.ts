import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sessionUserFromAuthUser, sessionUserWithProfileRoles } from '../../src/lib/auth-session';
import { needsRoleOnboarding } from '../../src/types/auth';

describe('sessionUserFromAuthUser', () => {
  it('메타데이터 역할로 마이페이지 진입 여부를 바로 판단한다', () => {
    const session = sessionUserFromAuthUser({
      id: '11111111-1111-1111-1111-111111111111',
      email: 'owner@example.com',
      created_at: '2026-01-01T00:00:00.000Z',
      user_metadata: {
        name: '광고주',
        roles: ['advertiser', 'creator'],
        role: 'advertiser',
        current_mode: 'advertiser',
        onboarding_complete: true,
      },
    });
    assert.equal(session.role, 'advertiser');
    assert.deepEqual(session.roles, ['advertiser', 'creator']);
    assert.equal(session.onboardingComplete, true);
  });

  it('profiles 테이블 역할이 있으면 메타데이터가 비어도 온보딩을 건너뛴다', () => {
    const session = sessionUserWithProfileRoles(
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'naver@example.com',
        user_metadata: { name: '네이버회원' },
      },
      { role: 'advertiser', roles: ['advertiser'] },
    );
    assert.equal(session.role, 'advertiser');
    assert.deepEqual(session.roles, ['advertiser']);
    assert.equal(needsRoleOnboarding(session), false);
  });
});
