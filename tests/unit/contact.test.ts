import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectPhoneValues,
  hasMatchingPhone,
  isPlaceholderOAuthEmail,
  isValidContactEmail,
  normalizeContactEmail,
  normalizePhone,
  phoneSearchKeys,
  sameKrPhone,
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

  it('010과 82 표기는 같은 휴대전화로 본다', () => {
    assert.equal(sameKrPhone('01077625258', '821077625258'), true);
    assert.equal(sameKrPhone('+82 10-7762-5258', '010-7762-5258'), true);
    assert.equal(sameKrPhone('01077625258', '01000000000'), false);
    assert.ok(phoneSearchKeys('01077625258').includes('821077625258'));
    assert.equal(
      hasMatchingPhone(
        {
          phone: '+821077625258',
          identities: [{ provider: 'phone', identity_data: { phone: '821077625258' } }],
        },
        '01077625258',
      ),
      true,
    );
    assert.deepEqual(collectPhoneValues({ phone: '82 10 7762 5258' }), ['01077625258']);
  });
});
