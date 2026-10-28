import 'server-only';

import type { User, UserIdentity } from '@supabase/supabase-js';
import { collectAuthEmails } from '@/lib/auth-emails';
import { normalizeContactEmail, normalizePhone } from '@/lib/contact';
import { createAdminClient } from '@/lib/supabase/admin';
import { parseAuthRoles, type MemberRole } from '@/types/auth';
import { getSupabaseEnv } from '@/lib/supabase/env';
import {
  isMissingPhoneColumn,
  markPhoneColumnMissing,
  profilePhoneSupported,
  upsertAppProfile,
} from '@/lib/supabase/profile-sync';
import type { Database } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

export type LinkedSocialUser = {
  user: User;
  switched: boolean;
  tokenHash: string | null;
};

function serviceRoleKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
}

function providersOf(user: User): string[] {
  const fromMeta = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers.filter((item): item is string => typeof item === 'string')
    : [];
  const fromIdentities = (user.identities ?? []).map((item) => item.provider);
  const provider =
    typeof user.app_metadata?.provider === 'string' ? [user.app_metadata.provider] : [];
  return [...new Set([...fromMeta, ...fromIdentities, ...provider])];
}

async function listMatchingUsers(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  emails: string[],
) {
  const matches: User[] = [];
  const emailSet = new Set(emails);
  let page = 1;
  while (page <= 10) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) {
      console.warn('[SponsorAuction] 소셜 계정 조회에 실패했습니다.', listed.error.message);
      break;
    }
    const users = listed.data.users ?? [];
    for (const item of users) {
      const itemEmails = collectAuthEmails(item);
      if (itemEmails.some((email) => emailSet.has(email))) {
        matches.push(item);
      }
    }
    if (users.length < 1000) {
      break;
    }
    page += 1;
  }
  return matches;
}

function pickCanonicalUser(users: User[]): User | null {
  if (users.length === 0) {
    return null;
  }
  const sorted = [...users].sort((left, right) => {
    const leftTime = Date.parse(left.created_at);
    const rightTime = Date.parse(right.created_at);
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    return left.id.localeCompare(right.id);
  });
  return sorted[0] ?? null;
}

async function attachIdentity(
  canonicalId: string,
  identity: UserIdentity,
): Promise<boolean> {
  const env = getSupabaseEnv();
  const key = serviceRoleKey();
  if (!env || key.length < 20) {
    return false;
  }

  const response = await fetch(`${env.url}/auth/v1/admin/users/${canonicalId}/identities`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: identity.provider,
      identity_data: identity.identity_data ?? {},
    }),
    cache: 'no-store',
  });

  if (response.ok) {
    return true;
  }

  const detail = await response.text().catch(() => '');
  if (/already|exists|duplicate|linked/i.test(detail)) {
    return true;
  }
  console.warn(
    '[SponsorAuction] Identity linking API 실패',
    identity.provider,
    response.status,
    detail.slice(0, 300),
  );
  return false;
}

async function reassignOwnedRows(
  admin: SupabaseClient<Database>,
  fromId: string,
  toId: string,
) {
  const tables: Array<{ table: keyof Database['public']['Tables']; column: string }> = [
    { table: 'auctions', column: 'author_id' },
    { table: 'bids', column: 'creator_id' },
    { table: 'time_slots', column: 'creator_id' },
    { table: 'chat_messages', column: 'sender_id' },
    { table: 'payouts', column: 'creator_id' },
    { table: 'time_slot_bids', column: 'advertiser_id' },
    { table: 'compliance_logs', column: 'actor_id' },
  ];

  for (const item of tables) {
    const { error } = await admin
      .from(item.table)
      .update({ [item.column]: toId } as never)
      .eq(item.column, fromId);
    if (error) {
      console.warn(
        `[SponsorAuction] ${item.table}.${item.column} 계정 병합 실패`,
        error.message,
      );
    }
  }
}

async function dropProfile(admin: SupabaseClient<Database>, userId: string) {
  const { error } = await admin.from('profiles').delete().eq('id', userId);
  if (error) {
    console.warn('[SponsorAuction] 중복 프로필 삭제 실패', error.message);
  }
}

async function generateMagicLinkHash(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  user: User,
) {
  const email = collectAuthEmails(user)[0] ?? user.email;
  if (!email) {
    return null;
  }
  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (link.error) {
    console.warn('[SponsorAuction] 통합 계정 세션 링크 생성 실패', link.error.message);
    return null;
  }
  return link.data.properties?.hashed_token ?? null;
}

export function isKakaoProviderUser(user: User) {
  return providersOf(user).includes('kakao');
}

async function userById(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string,
) {
  const result = await admin.auth.admin.getUserById(id);
  return result.data.user ?? null;
}

export async function findExistingAccountByContact(input: {
  email?: string | null;
  phone?: string | null;
  excludeUserId?: string | null;
}): Promise<User | null> {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }
  const email = normalizeContactEmail(input.email);
  const phone = normalizePhone(input.phone);
  const exclude = input.excludeUserId?.trim() || '';

  if (email) {
    const byProfile = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
    if (byProfile.data?.id && byProfile.data.id !== exclude) {
      const user = await userById(admin, byProfile.data.id);
      if (user) {
        return user;
      }
    }
    const byAuth = await findAuthUserByEmail(email);
    if (byAuth && byAuth.id !== exclude) {
      return byAuth;
    }
  }

  if (phone) {
    const byPhone = profilePhoneSupported()
      ? await admin.from('profiles').select('id').eq('phone', phone).maybeSingle()
      : { data: null, error: null };
    if (isMissingPhoneColumn(byPhone.error)) {
      markPhoneColumnMissing();
    }
    if (byPhone.data?.id && byPhone.data.id !== exclude) {
      const user = await userById(admin, byPhone.data.id);
      if (user) {
        return user;
      }
    }
    const listed = await listMatchingUsers(admin, email ? [email] : []);
    const all = listed.length > 0 ? listed : await listAllUsers(admin);
    const match = all.find((item) => {
      if (item.id === exclude) {
        return false;
      }
      const itemPhone = normalizePhone(
        item.phone ||
          (typeof item.user_metadata?.phone === 'string' ? item.user_metadata.phone : ''),
      );
      return Boolean(itemPhone) && itemPhone === phone;
    });
    if (match) {
      return match;
    }
  }

  return null;
}

async function listAllUsers(admin: NonNullable<ReturnType<typeof createAdminClient>>) {
  const users: User[] = [];
  let page = 1;
  while (page <= 10) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) {
      break;
    }
    const batch = listed.data.users ?? [];
    users.push(...batch);
    if (batch.length < 1000) {
      break;
    }
    page += 1;
  }
  return users;
}

export async function linkIncomingSocialUser(
  incoming: User,
  canonical: User,
  options?: { phone?: string | null; roles?: Array<MemberRole | 'admin'> | null },
): Promise<LinkedSocialUser> {
  const admin = createAdminClient();
  if (!admin) {
    return { user: incoming, switched: false, tokenHash: null };
  }

  for (const identity of incoming.identities ?? []) {
    if (identity.provider === 'email') {
      continue;
    }
    const already = (canonical.identities ?? []).some(
      (item) => item.provider === identity.provider && item.id === identity.id,
    );
    if (!already) {
      await attachIdentity(canonical.id, identity);
    }
  }

  const mergedRoles = parseAuthRoles(
    canonical.user_metadata?.roles,
    canonical.app_metadata?.roles,
    options?.roles,
  );
  const nextProviders = providersOf({
    ...canonical,
    app_metadata: {
      ...(canonical.app_metadata ?? {}),
      providers: [...providersOf(canonical), ...providersOf(incoming)],
    },
    identities: [...(canonical.identities ?? []), ...(incoming.identities ?? [])],
  });

  await admin.auth.admin.updateUserById(canonical.id, {
    email_confirm: true,
    phone: options?.phone || canonical.phone || undefined,
    user_metadata: {
      ...(canonical.user_metadata ?? {}),
      ...(incoming.user_metadata ?? {}),
      phone: options?.phone || canonical.user_metadata?.phone || null,
      roles: mergedRoles.length > 0 ? mergedRoles : canonical.user_metadata?.roles,
    },
    app_metadata: {
      ...(canonical.app_metadata ?? {}),
      provider: canonical.app_metadata?.provider ?? incoming.app_metadata?.provider,
      providers: nextProviders,
    },
  });

  await reassignOwnedRows(admin, incoming.id, canonical.id);
  await dropProfile(admin, incoming.id);
  await upsertAppProfile(admin, {
    id: canonical.id,
    email: collectAuthEmails(canonical)[0] ?? canonical.email,
    name:
      (typeof canonical.user_metadata?.name === 'string'
        ? canonical.user_metadata.name
        : null) ||
      (typeof incoming.user_metadata?.name === 'string' ? incoming.user_metadata.name : null),
    phone: options?.phone,
    roles: mergedRoles.length > 0 ? mergedRoles : undefined,
  });

  const tokenHash = await generateMagicLinkHash(admin, canonical);
  const deleted = await admin.auth.admin.deleteUser(incoming.id);
  if (deleted.error) {
    console.warn('[SponsorAuction] 중복 소셜 계정 삭제 실패', deleted.error.message);
  }

  const refreshed = await admin.auth.admin.getUserById(canonical.id);
  return {
    user: refreshed.data.user ?? canonical,
    switched: true,
    tokenHash,
  };
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) {
    return null;
  }
  const matches = await listMatchingUsers(admin, [normalized]);
  return pickCanonicalUser(matches);
}

export async function reconcileSocialIdentities(user: User): Promise<LinkedSocialUser> {
  const admin = createAdminClient();
  if (!admin) {
    return { user, switched: false, tokenHash: null };
  }

  const emails = collectAuthEmails(user);
  const displayName =
    (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : '') ||
    (typeof user.user_metadata?.nickname === 'string' ? user.user_metadata.nickname : '') ||
    (typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '') ||
    (typeof user.user_metadata?.preferred_username === 'string'
      ? user.user_metadata.preferred_username
      : '') ||
    null;

  if (emails.length > 0) {
    await admin.auth.admin.updateUserById(user.id, {
      email: emails[0],
      email_confirm: true,
    });
  }

  if (emails.length === 0) {
    await upsertAppProfile(admin, {
      id: user.id,
      email: user.email,
      name: displayName,
    });
    return { user, switched: false, tokenHash: null };
  }

  const matches = await listMatchingUsers(admin, emails);
  const canonical = pickCanonicalUser(matches.length > 0 ? matches : [user]);
  if (!canonical || canonical.id === user.id) {
    await upsertAppProfile(admin, {
      id: user.id,
      email: emails[0],
      name: displayName,
    });
    return { user, switched: false, tokenHash: null };
  }

  for (const identity of user.identities ?? []) {
    if (identity.provider === 'email') {
      continue;
    }
    const already = (canonical.identities ?? []).some(
      (item) => item.provider === identity.provider && item.id === identity.id,
    );
    if (!already) {
      await attachIdentity(canonical.id, identity);
    }
  }

  await admin.auth.admin.updateUserById(canonical.id, {
    email: emails[0],
    email_confirm: true,
    user_metadata: {
      ...(canonical.user_metadata ?? {}),
      ...(user.user_metadata ?? {}),
    },
    app_metadata: {
      ...(canonical.app_metadata ?? {}),
      provider: canonical.app_metadata?.provider ?? user.app_metadata?.provider,
      providers: providersOf({
        ...canonical,
        app_metadata: {
          ...(canonical.app_metadata ?? {}),
          providers: [...providersOf(canonical), ...providersOf(user)],
        },
        identities: [...(canonical.identities ?? []), ...(user.identities ?? [])],
      }),
    },
  });

  await reassignOwnedRows(admin, user.id, canonical.id);
  await dropProfile(admin, user.id);
  await upsertAppProfile(admin, {
    id: canonical.id,
    email: emails[0],
    name:
      (typeof canonical.user_metadata?.name === 'string'
        ? canonical.user_metadata.name
        : null) ||
      (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null),
  });

  const tokenHash = await generateMagicLinkHash(admin, canonical);
  const deleted = await admin.auth.admin.deleteUser(user.id);
  if (deleted.error) {
    console.warn('[SponsorAuction] 중복 소셜 계정 삭제 실패', deleted.error.message);
  }

  const refreshed = await admin.auth.admin.getUserById(canonical.id);
  return {
    user: refreshed.data.user ?? canonical,
    switched: true,
    tokenHash,
  };
}
