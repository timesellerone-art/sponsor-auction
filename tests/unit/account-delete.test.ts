import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickPhoneMergeIntoExisting } from '../../src/lib/account-link';

describe('phone merge into existing', () => {
  it('신규 소셜 세션을 기존 번호 소유 계정으로 합친다', () => {
    const current = { id: 'usr-new-social' };
    const existing = { id: 'usr-existing' };
    assert.deepEqual(pickPhoneMergeIntoExisting(current, null), {
      canonical: current,
      incoming: null,
    });
    assert.deepEqual(pickPhoneMergeIntoExisting(current, current), {
      canonical: current,
      incoming: null,
    });
    assert.deepEqual(pickPhoneMergeIntoExisting(current, existing), {
      canonical: existing,
      incoming: current,
    });
  });
});
