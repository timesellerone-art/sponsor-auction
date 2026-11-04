import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  canUnlinkProvider,
  listLinkedAccountStatuses,
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

  it('연동이 하나면 해제할 수 없고 두 개 이상이면 해제할 수 있다', () => {
    const googleOnly = {
      identities: [{ provider: 'google', id: 'g-1', identity_data: { sub: 'g-1' } }],
    } as never;
    assert.equal(canUnlinkProvider(googleOnly, 'google'), false);
    assert.equal(
      listLinkedAccountStatuses(googleOnly).find((item) => item.provider === 'google')?.linked,
      true,
    );
    assert.equal(
      listLinkedAccountStatuses(googleOnly).find((item) => item.provider === 'naver')?.linked,
      false,
    );

    const two = {
      identities: [
        { provider: 'google', id: 'g-1', identity_data: { sub: 'g-1' } },
        { provider: 'kakao', id: 'k-1', identity_data: { sub: 'k-1' } },
      ],
    } as never;
    assert.equal(canUnlinkProvider(two, 'google'), true);
    assert.equal(canUnlinkProvider(two, 'kakao'), true);
    assert.equal(canUnlinkProvider(two, 'naver'), false);
  });

  it('app_metadata.providers만 있어도 연동됨으로 보고 마지막 수단은 잠근다', () => {
    const metadataOnly = {
      identities: [],
      app_metadata: { providers: ['google', 'kakao'] },
    } as never;
    const rows = listLinkedAccountStatuses(metadataOnly);
    assert.equal(rows.find((item) => item.provider === 'google')?.linked, true);
    assert.equal(rows.find((item) => item.provider === 'kakao')?.canUnlink, true);
    assert.equal(rows.find((item) => item.provider === 'naver')?.linked, false);

    const lastMethod = {
      identities: [],
      app_metadata: { providers: ['google'] },
    } as never;
    assert.equal(canUnlinkProvider(lastMethod, 'google'), false);
  });

  it('email 매직링크가 app_metadata를 덮어도 user_metadata.linked_providers는 연동됨으로 본다', () => {
    const afterMagicLink = {
      identities: [{ provider: 'email', id: 'e-1' }],
      app_metadata: { providers: ['email'] },
      user_metadata: { linked_providers: ['google', 'kakao'] },
    } as never;
    assert.equal(canUnlinkProvider(afterMagicLink, 'kakao'), true);
    assert.equal(
      listLinkedAccountStatuses(afterMagicLink).find((item) => item.provider === 'google')?.linked,
      true,
    );
  });
});
