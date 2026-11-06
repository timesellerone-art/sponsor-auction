import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { readBearerToken } from '../../src/lib/auth-request';

describe('auth request bearer', () => {
  it('Authorization 헤더에서 Bearer 토큰만 읽는다', () => {
    assert.equal(readBearerToken('Bearer abc.def'), 'abc.def');
    assert.equal(readBearerToken('bearer token-1'), 'token-1');
    assert.equal(readBearerToken('Basic abc'), '');
    assert.equal(readBearerToken(null), '');
  });
});
