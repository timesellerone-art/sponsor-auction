import 'server-only';

import type { PostgrestError, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import { parseAuthRoles, primaryAuthRole, type MemberRole } from '@/types/auth';

const PROFILE_COLUMNS_WITH_PHONE = 'id, name, email, phone, role, roles, status, created_at';
const PROFILE_COLUMNS_BASE = 'id, name, email, role, roles, status, created_at';

let phoneColumnAvailable = true;

export function isMissingPhoneColumn(error: Pick<PostgrestError, 'code' | 'message'> | null) {
  if (!error) {
    return false;
  }
  return error.code === '42703' || error.code === 'PGRST204' || /phone/i.test(error.message);
}

export function profilePhoneSupported() {
  return phoneColumnAvailable;
}

export function markPhoneColumnMissing() {
  phoneColumnAvailable = false;
}

function profileColumns() {
  return phoneColumnAvailable ? PROFILE_COLUMNS_WITH_PHONE : PROFILE_COLUMNS_BASE;
}

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: 'advertiser' | 'creator' | 'admin' | null;
  roles?: Array<'advertiser' | 'creator' | 'admin'> | null;
  status: 'active' | 'suspended';
  created_at: string;
};

type ProfileResult = { data: ProfileRow | null; error: PostgrestError | null };

async function withPhoneFallback(run: (includePhone: boolean) => PromiseLike<ProfileResult>) {
  const first = await run(phoneColumnAvailable);
  if (phoneColumnAvailable && isMissingPhoneColumn(first.error)) {
    phoneColumnAvailable = false;
    return run(false);
  }
  return first;
}

export type SyncedProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'advertiser' | 'creator' | 'admin' | null;
  roles: Array<'advertiser' | 'creator' | 'admin'>;
  status: 'active' | 'suspended';
  createdAt: string;
};

export function fallbackProfileEmail(userId: string) {
  return `user.${userId.replace(/-/g, '').slice(0, 12)}@oauth.sponsor-auction.local`;
}

export function resolveProfileEmail(
  userId: string,
  ...candidates: Array<string | null | undefined>
) {
  for (const candidate of candidates) {
    const value = candidate?.trim() || '';
    if (value.includes('@')) {
      return value;
    }
  }
  return fallbackProfileEmail(userId);
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
    phone?: string | null;
    role?: MemberRole | 'admin' | null;
    roles?: Array<MemberRole | 'admin'> | null;
  },
): Promise<SyncedProfile | null> {
  const email = resolveProfileEmail(input.id, input.email);
  const name = input.name?.trim() || email.split('@')[0] || '회원';
  const phone = input.phone?.trim() || null;
  const current = await admin
    .from('profiles')
    .select('role, roles')
    .eq('id', input.id)
    .maybeSingle();
  const nextRoles = parseAuthRoles(current.data?.roles, current.data?.role, input.roles, input.role);
  const nextRole = primaryAuthRole(nextRoles);
  const base = {
    name,
    email,
    status: 'active' as const,
    role: nextRole,
    roles: nextRoles,
  };

  const upserted = await withPhoneFallback((includePhone) =>
    admin
      .from('profiles')
      .upsert(
        includePhone ? { id: input.id, ...base, phone } : { id: input.id, ...base },
        { onConflict: 'id' },
      )
      .select(includePhone ? PROFILE_COLUMNS_WITH_PHONE : PROFILE_COLUMNS_BASE)
      .maybeSingle<ProfileRow>(),
  );
  if (!upserted.error && upserted.data) {
    return toSynced(upserted.data);
  }

  const updated = await withPhoneFallback((includePhone) =>
    admin
      .from('profiles')
      .update(includePhone ? { ...base, phone } : base)
      .eq('id', input.id)
      .select(includePhone ? PROFILE_COLUMNS_WITH_PHONE : PROFILE_COLUMNS_BASE)
      .maybeSingle<ProfileRow>(),
  );
  if (!updated.error && updated.data) {
    return toSynced(updated.data);
  }

  const roleOnly = await admin
    .from('profiles')
    .update({ role: nextRole, roles: nextRoles })
    .eq('id', input.id)
    .select(profileColumns())
    .maybeSingle<ProfileRow>();
  if (!roleOnly.error && roleOnly.data) {
    return toSynced(roleOnly.data);
  }

  console.warn(
    '[SponsorAuction] 프로필 upsert 실패',
    upserted.error?.message || updated.error?.message || roleOnly.error?.message,
    upserted.error?.code || updated.error?.code,
  );
  return null;
}

function toSynced(row: ProfileRow): SyncedProfile {
  const roles = parseAuthRoles(row.roles, row.role);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone ?? null,
    role: primaryAuthRole(roles) ?? row.role,
    roles,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listAndBackfillProfiles(admin: SupabaseClient<Database>) {
  const listProfiles = (includePhone: boolean) =>
    admin
      .from('profiles')
      .select(includePhone ? PROFILE_COLUMNS_WITH_PHONE : PROFILE_COLUMNS_BASE)
      .order('created_at', { ascending: false })
      .returns<ProfileRow[]>();

  let listed = await listProfiles(phoneColumnAvailable);
  if (phoneColumnAvailable && isMissingPhoneColumn(listed.error)) {
    phoneColumnAvailable = false;
    listed = await listProfiles(false);
  }
  if (listed.error) {
    return { profiles: [] as SyncedProfile[], error: listed.error.message };
  }

  const byId = new Map((listed.data ?? []).map((row) => [row.id, row]));

  try {
    let page = 1;
    while (page <= 10) {
      const users = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (users.error) {
        break;
      }
      const batch = users.data.users ?? [];
      for (const user of batch) {
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
            phone: synced.phone,
            role: synced.role,
            roles: synced.roles,
            status: synced.status,
            created_at: synced.createdAt,
          });
        }
      }
      if (batch.length < 1000) {
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
