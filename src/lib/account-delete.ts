import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  canUnlinkProvider,
  isNaverIdentityProvider,
  type SocialIdentityProvider,
} from '@/lib/auth-identities';
import { normalizePhone, toE164Kr } from '@/lib/contact';

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

export async function linkPhoneToAccount(admin: AdminClient, user: User, rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  const e164 = toE164Kr(phone);
  if (!phone || !e164) {
    throw new Error('올바른 휴대전화 번호를 입력해 주세요.');
  }

  const withPhone = await admin.auth.admin.updateUserById(user.id, {
    phone: e164,
    user_metadata: {
      ...(user.user_metadata ?? {}),
      phone,
      linked_providers: [...new Set([...stringList(user.user_metadata?.linked_providers), 'phone'])],
    },
    app_metadata: {
      ...(user.app_metadata ?? {}),
      providers: [...new Set([...stringList(user.app_metadata?.providers), 'phone'])],
      contact_phone: phone,
    },
  });
  if (withPhone.error) {
    throw new Error(withPhone.error.message || '휴대전화를 등록하지 못했습니다.');
  }

  const linked = await admin.rpc('link_provider_identity', {
    p_user_id: user.id,
    p_provider: 'phone',
    p_provider_id: e164.replace(/^\+/, ''),
    p_email: user.email ?? null,
    p_name: typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null,
  });
  if (linked.error && linked.error.code !== 'PGRST202') {
    console.warn('[SponsorAuction] 휴대전화 identity 연결 실패', linked.error.message);
  }

  const profile = await admin.from('profiles').update({ phone }).eq('id', user.id);
  if (profile.error) {
    console.warn('[SponsorAuction] 프로필 휴대전화 저장 실패', profile.error.message);
  }
  return (await admin.auth.admin.getUserById(user.id)).data.user ?? withPhone.data.user ?? user;
}
