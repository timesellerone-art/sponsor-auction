import type { SupabaseClient, User } from '@supabase/supabase-js';

export const SOCIAL_IDENTITY_PROVIDERS = ['google', 'kakao', 'naver', 'phone'] as const;
export type SocialIdentityProvider = (typeof SOCIAL_IDENTITY_PROVIDERS)[number];

type AdminClient = SupabaseClient;

function identitySub(identity: {
  id?: string;
  identity_data?: Record<string, unknown> | null;
}) {
  const sub = identity.identity_data?.sub;
  return typeof sub === 'string' && sub.trim() ? sub.trim() : (identity.id?.trim() ?? '');
}

export function isNaverIdentityProvider(provider: string | null | undefined) {
  return provider === 'naver' || provider === 'custom:naver';
}

export function matchesIdentityProvider(
  identityProvider: string | null | undefined,
  wanted: SocialIdentityProvider,
) {
  if (wanted === 'naver') {
    return isNaverIdentityProvider(identityProvider);
  }
  return identityProvider === wanted;
}

export function userHasProviderIdentity(
  user: User | null | undefined,
  provider: SocialIdentityProvider,
  providerId?: string | null,
) {
  if (!user) {
    return false;
  }
  const wanted = providerId?.trim() ?? '';
  return (user.identities ?? []).some((identity) => {
    if (!matchesIdentityProvider(identity.provider, provider)) {
      return false;
    }
    return (
      !wanted ||
      identitySub({
        id: identity.id,
        identity_data: (identity.identity_data ?? null) as Record<string, unknown> | null,
      }) === wanted
    );
  });
}

export function userHasBundledSocialIdentities(user: User | null | undefined) {
  return (
    userHasProviderIdentity(user, 'google') &&
    userHasProviderIdentity(user, 'kakao') &&
    userHasProviderIdentity(user, 'naver') &&
    userHasProviderIdentity(user, 'phone')
  );
}

let providerRpcAvailable = true;

export async function linkProviderIdentity(
  admin: AdminClient,
  params: {
    userId: string;
    provider: SocialIdentityProvider;
    providerId: string;
    email?: string | null;
    name?: string | null;
  },
) {
  const providerId = params.providerId.trim();
  if (!params.userId || !providerId) {
    return false;
  }

  if (providerRpcAvailable) {
    const linked = await admin.rpc('link_provider_identity', {
      p_user_id: params.userId,
      p_provider: params.provider,
      p_provider_id: providerId,
      p_email: params.email ?? null,
      p_name: params.name ?? null,
    });
    if (!linked.error) {
      return true;
    }
    if (linked.error.code === 'PGRST202') {
      providerRpcAvailable = false;
    }
  }

  if (params.provider === 'naver') {
    const linked = await admin.rpc('link_naver_identity', {
      p_user_id: params.userId,
      p_naver_id: providerId,
      p_email: params.email ?? null,
      p_name: params.name ?? null,
    });
    return !linked.error;
  }

  return false;
}
