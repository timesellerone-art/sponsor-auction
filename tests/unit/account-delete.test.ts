import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickPhoneLinkMergePair } from '../../src/lib/account-link';

describe('phone link merge pair', () => {
  it('같은 번호의 다른 계정만 현재 UID로 합친다', () => {
    const current = { id: 'usr-current' };
    const existing = { id: 'usr-existing' };
    assert.deepEqual(pickPhoneLinkMergePair(current, null), {
      canonical: current,
      incoming: null,
    });
    assert.deepEqual(pickPhoneLinkMergePair(current, current), {
      canonical: current,
      incoming: null,
    });
    assert.deepEqual(pickPhoneLinkMergePair(current, existing), {
      canonical: current,
      incoming: existing,
    });
  });
});
