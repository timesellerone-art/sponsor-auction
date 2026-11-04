import type { SupabaseClient, User, UserIdentity } from '@supabase/supabase-js';
import { normalizePhone } from './contact';

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

export const SOCIAL_IDENTITY_LABELS: Record<SocialIdentityProvider, string> = {
  google: 'Google',
  kakao: 'Kakao',
  naver: 'Naver',
  phone: 'Phone',
};

export type LinkedAccountStatus = {
  provider: SocialIdentityProvider;
  label: string;
  linked: boolean;
  canUnlink: boolean;
  hint: string | null;
};

function identityHint(identity: UserIdentity | undefined, provider: SocialIdentityProvider) {
  const data = (identity?.identity_data ?? {}) as Record<string, unknown>;
  if (provider === 'phone') {
    const phone =
      (typeof data.phone === 'string' && data.phone) ||
      (typeof data.sub === 'string' && data.sub) ||
      '';
    return normalizePhone(phone) || null;
  }
  if (typeof data.email === 'string' && data.email.includes('@')) {
    return data.email;
  }
  return null;
}

export function userHasPhoneLogin(user: User | null | undefined) {
  if (!user) {
    return false;
  }
  return userHasProviderIdentity(user, 'phone') || Boolean(normalizePhone(user.phone));
}

function metadataProviders(user: User | null | undefined) {
  const fromApp = user?.app_metadata?.providers;
  const fromUser = user?.user_metadata?.linked_providers;
  const values = [
    ...(Array.isArray(fromApp) ? fromApp : []),
    ...(Array.isArray(fromUser) ? fromUser : []),
  ];
  return values.filter((item): item is string => typeof item === 'string');
}

export function isProviderLinked(user: User | null | undefined, provider: SocialIdentityProvider) {
  if (provider === 'phone') {
    return userHasPhoneLogin(user);
  }
  if (userHasProviderIdentity(user, provider)) {
    return true;
  }
  const providers = metadataProviders(user);
  if (provider === 'naver') {
    return providers.some((item) => isNaverIdentityProvider(item));
  }
  return providers.includes(provider);
}

export function linkedSocialProviderCount(user: User | null | undefined) {
  return SOCIAL_IDENTITY_PROVIDERS.filter((provider) => isProviderLinked(user, provider)).length;
}

export function findProviderIdentity(user: User | null | undefined, provider: SocialIdentityProvider) {
  return (user?.identities ?? []).find((identity) =>
    matchesIdentityProvider(identity.provider, provider),
  );
}

export function canUnlinkProvider(user: User | null | undefined, provider: SocialIdentityProvider) {
  return isProviderLinked(user, provider) && linkedSocialProviderCount(user) >= 2;
}

export function listLinkedAccountStatuses(user: User | null | undefined): LinkedAccountStatus[] {
  const unlinkable = linkedSocialProviderCount(user) >= 2;
  return SOCIAL_IDENTITY_PROVIDERS.map((provider) => {
    const linked = isProviderLinked(user, provider);
    const identity = findProviderIdentity(user, provider);
    const phoneHint = provider === 'phone' ? normalizePhone(user?.phone) : null;
    return {
      provider,
      label: SOCIAL_IDENTITY_LABELS[provider],
      linked,
      canUnlink: linked && unlinkable,
      hint: identityHint(identity, provider) || phoneHint,
    };
  });
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
