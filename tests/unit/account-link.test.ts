import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isAuthUserId,
  pickPreferredMergeUser,
  readAccountLinkUserId,
  readAuthUserIdFromCookies,
  signAccountLinkValue,
} from '../../src/lib/account-link';

describe('account link cookie', () => {
  it('서명된 UID 쿠키를 15분 안에 읽는다', () => {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'unit-account-link-secret';
    const userId = 'aee4b323-4fb7-4ea9-acbe-ea013b48c07d';
    const now = Date.parse('2026-11-02T05:32:09.000Z');
    const token = signAccountLinkValue(userId, now);
    assert.ok(token.includes(userId));
    assert.equal(readAccountLinkUserId(token, now + 60_000), userId);
    assert.equal(readAccountLinkUserId(token, now + 16 * 60 * 1000), null);
    assert.equal(readAccountLinkUserId(`${userId}.9999999999.tampered`, now), null);
    assert.equal(isAuthUserId(userId), true);
    assert.equal(isAuthUserId('not-a-user'), false);
    const packed = Buffer.from(JSON.stringify({ user: { id: userId } }), 'utf8').toString('base64url');
    assert.equal(
      readAuthUserIdFromCookies([{ name: 'sb-xxxx-auth-token', value: `base64-${packed}` }]),
      userId,
    );
  });

  it('세션 UID가 있으면 이메일이 달라도 그 계정으로 합친다', () => {
    const google = {
      id: 'aee4b323-4fb7-4ea9-acbe-ea013b48c07d',
      created_at: '2026-11-02T05:32:09.000Z',
    };
    const naver = {
      id: '8242f20d-346b-492b-8322-ed1a89b69ebc',
      created_at: '2026-11-02T05:32:24.000Z',
    };
    assert.equal(
      pickPreferredMergeUser(naver.id, [google, naver], google.id)?.id,
      google.id,
    );
    assert.equal(pickPreferredMergeUser(naver.id, [google, naver])?.id, google.id);
    assert.equal(pickPreferredMergeUser(google.id, [google], google.id), null);
  });
});
