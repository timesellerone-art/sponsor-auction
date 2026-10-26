import 'server-only';

import type { User, UserIdentity } from '@supabase/supabase-js';
import { collectAuthEmails } from '@/lib/auth-emails';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { upsertAppProfile } from '@/lib/supabase/profile-sync';
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
      name:
        typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null,
    });
    return { user, switched: false, tokenHash: null };
  }

  const matches = await listMatchingUsers(admin, emails);
  const canonical = pickCanonicalUser(matches.length > 0 ? matches : [user]);
  if (!canonical || canonical.id === user.id) {
    await upsertAppProfile(admin, {
      id: user.id,
      email: emails[0],
      name:
        typeof user.user_metadata?.name === 'string' ? user.user_metadata.name : null,
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
