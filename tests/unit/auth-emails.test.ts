import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectAuthEmails, magicLinkEmailFor } from '../../src/lib/auth-emails';

describe('collectAuthEmails', () => {
  it('placeholder 로컬 이메일은 제외하고 실제 이메일만 모은다', () => {
    const emails = collectAuthEmails({
      email: 'user.abc123@oauth.sponsor-auction.local',
      user_metadata: { email: 'same@example.com' },
      identities: [
        {
          email: 'google@example.com',
          identity_data: { email: 'kakao@example.com' },
        },
      ],
    });

    assert.deepEqual(emails.sort(), ['google@example.com', 'same@example.com']);
  });

  it('온보딩 대표 이메일(contact_email)도 계정 매칭에 쓴다', () => {
    assert.deepEqual(
      collectAuthEmails({
        email: 'user.abc@oauth.sponsor-auction.local',
        app_metadata: { contact_email: 'owner@example.com' },
      }),
      ['owner@example.com'],
    );
    assert.deepEqual(
      collectAuthEmails({
        email: 'user.abc@oauth.sponsor-auction.local',
        user_metadata: { contact_email: 'kept@example.com' },
      }),
      ['kept@example.com'],
    );
  });

  it('매직링크는 auth.users.email(placeholder 포함)을 우선한다', () => {
    assert.equal(
      magicLinkEmailFor({
        email: 'user.abc@oauth.sponsor-auction.local',
        user_metadata: { contact_email: 'owner@example.com' },
      }),
      'user.abc@oauth.sponsor-auction.local',
    );
    assert.equal(
      magicLinkEmailFor({
        email: '',
        app_metadata: { contact_email: 'owner@example.com' },
      }),
      'owner@example.com',
    );
  });

  it('이메일이 없으면 빈 배열을 반환한다', () => {
    assert.deepEqual(collectAuthEmails({ email: 'not-an-email' }), []);
    assert.deepEqual(collectAuthEmails(null), []);
  });
});
