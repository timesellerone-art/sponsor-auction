import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { MemberRole } from '@/types/auth';

const PROFILE_COLUMNS = 'id, name, email, role, status, created_at';

export type SyncedProfile = {
  id: string;
  name: string;
  email: string;
  role: 'advertiser' | 'creator' | 'admin' | null;
  status: 'active' | 'suspended';
  createdAt: string;
};

function fallbackEmail(userId: string) {
  return `user.${userId.replace(/-/g, '').slice(0, 12)}@oauth.sponsor-auction.local`;
}

export function profileNameFromUser(user: User, fallback = '회원') {
  const metaName =
    typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '';
  const email = user.email?.trim() || '';
  return metaName || email.split('@')[0] || fallback;
}

export async function upsertAppProfile(
  admin: SupabaseClient<Database>,
  input: {
    id: string;
    email?: string | null;
    name?: string | null;
    role?: MemberRole | 'admin' | null;
  },
): Promise<SyncedProfile | null> {
  const email = input.email?.trim() || fallbackEmail(input.id);
  const name = input.name?.trim() || email.split('@')[0] || '회원';
  const payload = {
    id: input.id,
    name,
    email,
    status: 'active' as const,
    ...(input.role ? { role: input.role } : {}),
  };

  const upserted = await admin
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (!upserted.error && upserted.data) {
    return toSynced(upserted.data);
  }

  const patch: {
    name: string;
    email: string;
    status: 'active';
    role?: MemberRole | 'admin';
  } = { name, email, status: 'active' };
  if (input.role) {
    patch.role = input.role;
  }

  const updated = await admin
    .from('profiles')
    .update(patch)
    .eq('id', input.id)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (!updated.error && updated.data) {
    return toSynced(updated.data);
  }

  console.warn(
    '[SponsorAuction] 프로필 upsert 실패',
    upserted.error?.message || updated.error?.message,
  );
  return null;
}

function toSynced(row: {
  id: string;
  name: string;
  email: string;
  role: 'advertiser' | 'creator' | 'admin' | null;
  status: 'active' | 'suspended';
  created_at: string;
}): SyncedProfile {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listAndBackfillProfiles(admin: SupabaseClient<Database>) {
  const { data: existing, error } = await admin
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) {
    return { profiles: [] as SyncedProfile[], error: error.message };
  }

  const byId = new Map((existing ?? []).map((row) => [row.id, row]));

  try {
    let page = 1;
    while (page <= 10) {
      const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listed.error) {
        break;
      }
      const users = listed.data.users ?? [];
      for (const user of users) {
        if (byId.has(user.id)) {
          continue;
        }
        const synced = await upsertAppProfile(admin, {
          id: user.id,
          email: user.email,
          name: profileNameFromUser(user),
        });
        if (synced) {
          byId.set(synced.id, {
            id: synced.id,
            name: synced.name,
            email: synced.email,
            role: synced.role,
            status: synced.status,
            created_at: synced.createdAt,
          });
        }
      }
      if (users.length < 1000) {
        break;
      }
      page += 1;
    }
  } catch (error) {
    console.warn('[SponsorAuction] auth.users 동기화 중 경고', error);
  }

  const profiles = Array.from(byId.values())
    .map(toSynced)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return { profiles, error: null as string | null };
}
