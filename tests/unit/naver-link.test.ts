import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toE164Kr } from '../../src/lib/naver-link';

describe('네이버 계정 연결 헬퍼', () => {
  it('국내 휴대전화를 E.164로 바꾼다', () => {
    assert.equal(toE164Kr('010-5555-1234'), '+821055551234');
    assert.equal(toE164Kr('+82 10 5555 1234'), '+821055551234');
    assert.equal(toE164Kr(''), '');
    assert.equal(toE164Kr(null), '');
  });
});
