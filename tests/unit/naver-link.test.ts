import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toE164Kr, userHasNaverIdentity } from '../../src/lib/naver-link';

describe('네이버 계정 연결 헬퍼', () => {
  it('국내 휴대전화를 E.164로 바꾼다', () => {
    assert.equal(toE164Kr('010-5555-1234'), '+821055551234');
    assert.equal(toE164Kr('+82 10 5555 1234'), '+821055551234');
    assert.equal(toE164Kr(''), '');
    assert.equal(toE164Kr(null), '');
  });

  it('auth.identities의 naver provider를 인식한다', () => {
    assert.equal(
      userHasNaverIdentity({
        identities: [
          {
            provider: 'google',
            id: 'g-1',
            identity_data: { sub: 'g-1' },
          },
          {
            provider: 'naver',
            id: 'naver-sub-1',
            identity_data: { sub: 'naver-sub-1' },
          },
        ],
      } as never),
      true,
    );
    assert.equal(
      userHasNaverIdentity(
        {
          identities: [{ provider: 'naver', id: 'naver-sub-1', identity_data: { sub: 'naver-sub-1' } }],
        } as never,
        'naver-sub-1',
      ),
      true,
    );
    assert.equal(userHasNaverIdentity({ identities: [{ provider: 'google' }] } as never), false);
  });
});
