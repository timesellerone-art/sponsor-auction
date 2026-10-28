import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPlaceholderOAuthEmail,
  isValidContactEmail,
  normalizeContactEmail,
  normalizePhone,
} from '../../src/lib/contact';

describe('contact helpers', () => {
  it('placeholder 이메일은 연락처로 쓰지 않는다', () => {
    assert.equal(
      isPlaceholderOAuthEmail('user.910b805807c6@oauth.sponsor-auction.local'),
      true,
    );
    assert.equal(normalizeContactEmail('user.910b805807c6@oauth.sponsor-auction.local'), '');
    assert.equal(isValidContactEmail('timesellerone@gmail.com'), true);
  });

  it('전화번호를 숫자만 남긴다', () => {
    assert.equal(normalizePhone('010-1234-5678'), '01012345678');
    assert.equal(normalizePhone('+82 10-1234-5678'), '01012345678');
  });
});
