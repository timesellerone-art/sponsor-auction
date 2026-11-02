import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  userHasBundledSocialIdentities,
  userHasProviderIdentity,
} from '../../src/lib/auth-identities';

describe('소셜 identity 묶음', () => {
  it('Google·Kakao·Naver·Phone이 모두 있으면 한 계정으로 본다', () => {
    const user = {
      identities: [
        { provider: 'google', id: 'g-1', identity_data: { sub: 'g-1' } },
        { provider: 'kakao', id: 'k-1', identity_data: { sub: 'k-1' } },
        { provider: 'naver', id: 'n-1', identity_data: { sub: 'n-1' } },
        { provider: 'phone', id: 'p-1', identity_data: { sub: 'p-1' } },
      ],
    } as never;
    assert.equal(userHasProviderIdentity(user, 'kakao', 'k-1'), true);
    assert.equal(userHasBundledSocialIdentities(user), true);
  });

  it('custom:naver도 네이버 identity로 인정한다', () => {
    assert.equal(
      userHasProviderIdentity(
        {
          identities: [
            { provider: 'custom:naver', id: 'n-2', identity_data: { sub: 'n-2' } },
          ],
        } as never,
        'naver',
        'n-2',
      ),
      true,
    );
    assert.equal(
      userHasBundledSocialIdentities({
        identities: [{ provider: 'google' }, { provider: 'kakao' }],
      } as never),
      false,
    );
  });
});
