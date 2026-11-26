import type { SupabaseClient, User } from '@supabase/supabase-js';
import { pickPhoneMergeIntoExisting } from '@/lib/account-link';
import { ACCOUNT_UNIFIED_MESSAGE } from '@/lib/account-unify';
import {
  canUnlinkProvider,
  isNaverIdentityProvider,
  type SocialIdentityProvider,
} from '@/lib/auth-identities';
import {
  findExistingAccountByContact,
  generateMagicLinkHash,
  mergeUserInto,
} from '@/lib/auth-identity';
import { normalizePhone, toE164Kr } from '@/lib/contact';
import { clearedPhoneOtpMetadata } from '@/lib/phone-otp';
import { isMemberRole, parseAuthRoles, type MemberRole } from '@/types/auth';

type AdminClient = SupabaseClient;

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function unlinkSocialProvider(
  admin: AdminClient,
  user: User,
  provider: SocialIdentityProvider,
) {
  if (!canUnlinkProvider(user, provider)) {
    throw new Error('마지막 로그인 수단은 해제할 수 없습니다.');
  }

  const removed = await admin.rpc('unlink_provider_identity', {
    p_user_id: user.id,
    p_provider: provider,
  });
  if (removed.error && removed.error.code !== 'PGRST202') {
    throw new Error(removed.error.message || '연동을 해제하지 못했습니다.');
  }

  const dropProvider = (item: string) => {
    if (provider === 'naver') {
      return !isNaverIdentityProvider(item) && item !== 'naver';
    }
    return item !== provider;
  };
  const providers = stringList(user.app_metadata?.providers).filter(dropProvider);
  const linkedProviders = stringList(user.user_metadata?.linked_providers).filter(dropProvider);
  const metadata: {
    app_metadata: Record<string, unknown>;
    user_metadata: Record<string, unknown>;
    phone?: string;
  } = {
    app_metadata: {
      ...(user.app_metadata ?? {}),
      providers,
    },
    user_metadata: {
      ...(user.user_metadata ?? {}),
      linked_providers: linkedProviders,
    },
  };
  if (provider === 'phone') {
    metadata.phone = '';
    metadata.app_metadata.contact_phone = null;
    metadata.user_metadata.phone = null;
    metadata.user_metadata.phone_verified = false;
  }
  const updated = await admin.auth.admin.updateUserById(user.id, metadata);
  if (updated.error) {
    throw new Error(updated.error.message || '연동 정보를 갱신하지 못했습니다.');
  }
  if (provider === 'phone') {
    await admin.from('profiles').update({ phone: null }).eq('id', user.id);
  }
  return updated.data.user ?? user;
}

export async function deleteAccountCompletely(admin: AdminClient, userId: string) {
  const rpc = await admin.rpc('delete_own_account', { p_user_id: userId });
  if (!rpc.error) {
    const remaining = await admin.auth.admin.getUserById(userId);
    if (!remaining.data.user) {
      return;
    }
  } else if (rpc.error.code !== 'PGRST202') {
    console.warn('[SponsorAuction] delete_own_account RPC 실패, 관리자 삭제로 이어갑니다', rpc.error.message);
  }

  await Promise.all([
    admin.from('creator_metrics').delete().eq('profile_id', userId),
    admin.from('chat_messages').delete().eq('sender_id', userId),
    admin.from('time_slot_bids').delete().eq('advertiser_id', userId),
    admin.from('time_slots').delete().eq('creator_id', userId),
    admin.from('payouts').update({ creator_id: null }).eq('creator_id', userId),
    admin.from('bids').update({ creator_id: null }).eq('creator_id', userId),
    admin.from('auctions').update({ author_id: null }).eq('author_id', userId),
    admin.from('compliance_logs').delete().eq('actor_id', userId),
  ]);
  await admin.from('profiles').delete().eq('id', userId);

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await admin.auth.admin.deleteUser(userId);
    const remaining = await admin.auth.admin.getUserById(userId);
    if (!remaining.data.user) {
      return;
    }
  }
  throw new Error('계정을 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

export type VerifiedPhoneResult = {
  user: User;
  merged: boolean;
  message: string | null;
  tokenHash: string | null;
  roles: MemberRole[];
  onboardingComplete: boolean;
};

export async function completeVerifiedPhone(
  admin: AdminClient,
  user: User,
  rawPhone: string,
): Promise<VerifiedPhoneResult> {
  const phone = normalizePhone(rawPhone);
  const e164 = toE164Kr(phone);
  if (!phone || !e164) {
    throw new Error('올바른 휴대전화 번호를 입력해 주세요.');
  }

  const existing = await findExistingAccountByContact({
    phone,
    excludeUserId: user.id,
  });
  const pair = pickPhoneMergeIntoExisting(user, existing);
  let target = user;
  let merged = false;
  if (pair.incoming) {
    target = await mergeUserInto(pair.incoming, pair.canonical, { phone });
    merged = true;
  }

  const withPhone = await admin.auth.admin.updateUserById(target.id, {
    phone: e164,
    user_metadata: clearedPhoneOtpMetadata(target, {
      phone,
      phone_verified: true,
      linked_providers: [...new Set([...stringList(target.user_metadata?.linked_providers), 'phone'])],
    }),
    app_metadata: {
      ...(target.app_metadata ?? {}),
      providers: [...new Set([...stringList(target.app_metadata?.providers), 'phone'])],
      contact_phone: phone,
    },
  });
  if (withPhone.error) {
    throw new Error(withPhone.error.message || '휴대전화를 등록하지 못했습니다.');
  }

  const linked = await admin.rpc('link_provider_identity', {
    p_user_id: target.id,
    p_provider: 'phone',
    p_provider_id: e164.replace(/^\+/, ''),
    p_email: target.email ?? null,
    p_name: typeof target.user_metadata?.name === 'string' ? target.user_metadata.name : null,
  });
  if (linked.error && linked.error.code !== 'PGRST202') {
    console.warn('[SponsorAuction] 휴대전화 identity 연결 실패', linked.error.message);
  }

  const profile = await admin.from('profiles').update({ phone }).eq('id', target.id);
  if (profile.error) {
    console.warn('[SponsorAuction] 프로필 휴대전화 저장 실패', profile.error.message);
  }

  const refreshed = (await admin.auth.admin.getUserById(target.id)).data.user
    ?? withPhone.data.user
    ?? target;
  const roles = parseAuthRoles(
    refreshed.user_metadata?.roles,
    refreshed.user_metadata?.role,
  ).filter(isMemberRole);
  const onboardingComplete =
    refreshed.user_metadata?.onboarding_complete === true || roles.length > 0;

  let tokenHash: string | null = null;
  if (merged) {
    tokenHash = await generateMagicLinkHash(admin, refreshed);
    if (!tokenHash) {
      throw new Error(
        '계정을 통합했지만 세션을 전환하지 못했습니다. 기존 계정으로 다시 로그인해 주세요.',
      );
    }
  }

  return {
    user: refreshed,
    merged,
    message: merged ? ACCOUNT_UNIFIED_MESSAGE : null,
    tokenHash,
    roles,
    onboardingComplete,
  };
}
