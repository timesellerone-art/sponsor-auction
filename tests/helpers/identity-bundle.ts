import type { User } from '@supabase/supabase-js';
import {
  userHasBundledSocialIdentities,
  userHasProviderIdentity,
} from '../../src/lib/auth-identities';

export function identityProviderList(user: User | null | undefined) {
  return (user?.identities ?? []).map((item) => item.provider).join(',');
}

export function hasE2ELinkedBundle(user: User | null | undefined) {
  if (userHasBundledSocialIdentities(user)) {
    return true;
  }

  const hasEmailOrGoogle = (user?.identities ?? []).some(
    (item) => item.provider === 'email' || item.provider === 'google',
  );
  return (
    hasEmailOrGoogle &&
    userHasProviderIdentity(user, 'naver') &&
    userHasProviderIdentity(user, 'phone')
  );
}
