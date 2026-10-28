import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { collectAuthEmails } from '@/lib/auth-emails';
import { normalizeContactEmail, normalizePhone } from '@/lib/contact';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  isMissingPhoneColumn,
  markPhoneColumnMissing,
  profilePhoneSupported,
  upsertAppProfile,
} from '@/lib/supabase/profile-sync';
import type { Database } from '@/types/database';
import {
  MEMBER_ROLES,
  isMemberRole,
  parseAuthRoles,
  primaryAuthRole,
  type MemberRole,
  type ProofProvider,
} from '@/types/auth';

type AdminClient = SupabaseClient<Database>;

export type LinkedSocialUser = {
  user: User;
  switched: boolean;
  tokenHash: string | null;
};

export const PENDING_MERGE_COOKIE = 'sponsor-auction-merge-from';
export const PENDING_MERGE_TTL_SECONDS = 30 * 60;

type PendingMerge = {
  into: string;
  roles: MemberRole[];
  phone: string | null;
  expires_at: string;
};

export class AccountMergeUnavailableError extends Error {
  constructor() {
    super(
      '계정 통합용 DB 함수(merge_auth_identities)가 없습니다. supabase/migrations/20261028_account_linking.sql 을 적용하세요.',
    );
    this.name = 'AccountMergeUnavailableError';
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function providersOf(user: User): string[] {
  const provider =
    typeof user.app_metadata?.provider === 'string' ? [user.app_metadata.provider] : [];
  return [
    ...new Set([
      ...stringList(user.app_metadata?.providers),
      ...(user.identities ?? []).map((item) => item.provider),
      ...provider,
    ]),
  ];
}

function naverIdsOf(user: User): string[] {
  return stringList(user.app_metadata?.naver_ids);
}

function displayNameOf(user: User): string | null {
  const meta = user.user_metadata ?? {};
  for (const key of ['name', 'full_name', 'nickname', 'preferred_username']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/** 기존 계정 소유를 증명할 로그인 수단. 이메일 링크는 입력한 이메일이 그 계정의 이메일일 때만 허용한다. */
export function proofProvidersOf(user: User, typedEmail?: string | null): ProofProvider[] {
  const providers = providersOf(user);
  const proofs: ProofProvider[] = (['google', 'kakao', 'naver'] as const).filter((provider) =>
    providers.includes(provider),
  );
  const email = normalizeContactEmail(typedEmail);
  if (email && collectAuthEmails(user).includes(email)) {
    proofs.push('email');
  }
  return proofs;
}

export function maskEmail(email: string | null | undefined) {
  const value = email?.trim() || '';
  const [local, domain] = value.split('@');
  if (!local || !domain) {
    return '';
  }
  return `${local.slice(0, Math.min(3, local.length))}***@${domain}`;
}

async function listAllUsers(admin: AdminClient) {
  const users: User[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (listed.error) {
      console.warn('[SponsorAuction] auth.users 조회 실패', listed.error.message);
      break;
    }
    const batch = listed.data.users ?? [];
    users.push(...batch);
    if (batch.length < 1000) {
      break;
    }
  }
  return users;
}

function pickCanonicalUser(users: User[]): User | null {
  const sorted = [...users].sort((left, right) => {
    const diff = Date.parse(left.created_at) - Date.parse(right.created_at);
    return Number.isFinite(diff) && diff !== 0 ? diff : left.id.localeCompare(right.id);
  });
  return sorted[0] ?? null;
}

async function usersByEmails(admin: AdminClient, emails: string[]) {
  const wanted = new Set(emails);
  const all = await listAllUsers(admin);
  return all.filter((item) => collectAuthEmails(item).some((email) => wanted.has(email)));
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = createAdminClient();
  const normalized = email.trim().toLowerCase();
  if (!admin || !normalized.includes('@')) {
    return null;
  }
  return pickCanonicalUser(await usersByEmails(admin, [normalized]));
}

export async function findUserByNaverId(naverId: string): Promise<User | null> {
  const admin = createAdminClient();
  if (!admin || !naverId) {
    return null;
  }
  const all = await listAllUsers(admin);
  return pickCanonicalUser(all.filter((item) => naverIdsOf(item).includes(naverId)));
}

export async function findExistingAccountByContact(input: {
  email?: string | null;
  phone?: string | null;
  excludeUserId: string;
}): Promise<User | null> {
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }
  const email = normalizeContactEmail(input.email);
  const phone = normalizePhone(input.phone);
  const candidates = new Set<string>();

  if (email) {
    const byProfile = await admin.from('profiles').select('id').eq('email', email);
    (byProfile.data ?? []).forEach((row) => candidates.add(row.id));
  }
  if (phone && profilePhoneSupported()) {
    const byPhone = await admin.from('profiles').select('id').eq('phone', phone);
    if (isMissingPhoneColumn(byPhone.error)) {
      markPhoneColumnMissing();
    }
    (byPhone.data ?? []).forEach((row) => candidates.add(row.id));
  }

  const all = await listAllUsers(admin);
  const matches = all.filter((item) => {
    if (item.id === input.excludeUserId) {
      return false;
    }
    if (candidates.has(item.id)) {
      return true;
    }
    if (email && collectAuthEmails(item).includes(email)) {
      return true;
    }
    const itemPhone = normalizePhone(
      item.phone || (typeof item.user_metadata?.phone === 'string' ? item.user_metadata.phone : ''),
    );
    return Boolean(phone) && itemPhone === phone;
  });
  return pickCanonicalUser(matches);
}

async function reassignOwnedRows(admin: AdminClient, fromId: string, toId: string) {
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
      console.warn(`[SponsorAuction] ${item.table}.${item.column} 계정 병합 실패`, error.message);
    }
  }
}

async function generateMagicLinkHash(admin: AdminClient, user: User) {
  const email = collectAuthEmails(user)[0] ?? user.email;
  if (!email) {
    return null;
  }
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) {
    console.warn('[SponsorAuction] 통합 계정 세션 링크 생성 실패', link.error.message);
    return null;
  }
  return link.data.properties?.hashed_token ?? null;
}

/**
 * incoming 유저의 소셜 identity를 canonical로 옮기고 incoming auth.users/profiles 행을 삭제한다.
 * canonical에 이미 역할이 있으면 그 역할·current_mode를 유지한다.
 */
export async function mergeUserInto(
  incoming: User,
  canonical: User,
  options: { roles?: MemberRole[]; phone?: string | null } = {},
): Promise<User> {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('Supabase 서비스 키가 없어 계정을 통합할 수 없습니다.');
  }
  if (incoming.id === canonical.id) {
    return canonical;
  }

  const moved = await admin.rpc('merge_auth_identities', {
    p_from: incoming.id,
    p_to: canonical.id,
  });
  if (moved.error) {
    if (moved.error.code === 'PGRST202') {
      throw new AccountMergeUnavailableError();
    }
    throw new Error(`identity 이전 실패: ${moved.error.message}`);
  }

  const canonicalProfile = await admin
    .from('profiles')
    .select('role, roles')
    .eq('id', canonical.id)
    .maybeSingle();
  const keptRoles = parseAuthRoles(
    canonicalProfile.data?.roles,
    canonicalProfile.data?.role,
    canonical.user_metadata?.roles,
  );
  const baseRoles = keptRoles.length > 0 ? keptRoles : parseAuthRoles(options.roles);
  const roles = baseRoles.some(isMemberRole)
    ? parseAuthRoles(baseRoles, MEMBER_ROLES)
    : baseRoles;
  const storedMode = canonical.user_metadata?.current_mode;
  const currentMode = isMemberRole(storedMode)
    ? storedMode
    : (keptRoles.find(isMemberRole) ?? options.roles?.[0] ?? null);
  const phone =
    normalizePhone(options.phone) ||
    (typeof canonical.user_metadata?.phone === 'string' ? canonical.user_metadata.phone : '') ||
    null;

  await admin.auth.admin.updateUserById(canonical.id, {
    user_metadata: {
      ...(incoming.user_metadata ?? {}),
      ...(canonical.user_metadata ?? {}),
      roles,
      role: primaryAuthRole(roles),
      current_mode: currentMode,
      onboarding_complete: roles.length > 0,
      phone,
    },
    app_metadata: {
      naver_ids: [...new Set([...naverIdsOf(canonical), ...naverIdsOf(incoming)])],
      pending_merge: null,
    },
  });

  await reassignOwnedRows(admin, incoming.id, canonical.id);
  await admin.from('profiles').delete().eq('id', incoming.id);
  const deleted = await admin.auth.admin.deleteUser(incoming.id);
  if (deleted.error) {
    console.error('[SponsorAuction] 중복 auth.users 삭제 실패', incoming.id, deleted.error.message);
  }

  await upsertAppProfile(admin, {
    id: canonical.id,
    email: collectAuthEmails(canonical)[0] ?? canonical.email,
    name: displayNameOf(canonical) || displayNameOf(incoming),
    phone,
    roles,
    role: primaryAuthRole(roles),
  });

  const refreshed = await admin.auth.admin.getUserById(canonical.id);
  return refreshed.data.user ?? canonical;
}

/** 본인 확인(기존 계정 로그인) 전까지 병합 요청을 incoming 유저의 app_metadata에 기록한다. */
export async function requestPendingMerge(
  incoming: User,
  canonical: User,
  options: { roles: MemberRole[]; phone?: string | null },
) {
  const admin = createAdminClient();
  if (!admin) {
    throw new Error('Supabase 서비스 키가 없어 계정을 통합할 수 없습니다.');
  }
  const pending: PendingMerge = {
    into: canonical.id,
    roles: options.roles,
    phone: normalizePhone(options.phone) || null,
    expires_at: new Date(Date.now() + PENDING_MERGE_TTL_SECONDS * 1000).toISOString(),
  };
  const { error } = await admin.auth.admin.updateUserById(incoming.id, {
    app_metadata: { pending_merge: pending },
  });
  if (error) {
    throw new Error(`병합 요청 저장 실패: ${error.message}`);
  }
}

function readPendingMerge(user: User): PendingMerge | null {
  const raw = user.app_metadata?.pending_merge as Partial<PendingMerge> | null | undefined;
  if (!raw || typeof raw.into !== 'string' || typeof raw.expires_at !== 'string') {
    return null;
  }
  if (Date.parse(raw.expires_at) < Date.now()) {
    return null;
  }
  return {
    into: raw.into,
    roles: (raw.roles ?? []).filter(isMemberRole),
    phone: typeof raw.phone === 'string' ? raw.phone : null,
    expires_at: raw.expires_at,
  };
}

/**
 * 기존(대표) 계정으로 로그인해 본인 확인이 끝난 뒤 호출한다.
 * 쿠키의 임시 계정이 현재 로그인한 계정으로의 병합을 요청해 둔 경우에만 병합한다.
 */
export async function completePendingMerge(
  fromUserId: string | null | undefined,
  current: User,
): Promise<{ merged: boolean; user: User }> {
  const admin = createAdminClient();
  if (!admin || !fromUserId || fromUserId === current.id) {
    return { merged: false, user: current };
  }
  const incoming = (await admin.auth.admin.getUserById(fromUserId)).data.user;
  const pending = incoming ? readPendingMerge(incoming) : null;
  if (!incoming || !pending || pending.into !== current.id) {
    return { merged: false, user: current };
  }
  const user = await mergeUserInto(incoming, current, {
    roles: pending.roles,
    phone: pending.phone,
  });
  return { merged: true, user };
}

/** 같은 검증 이메일을 가진 기존 계정이 있으면 지금 로그인한 계정을 그쪽으로 합치고 세션 전환 토큰을 돌려준다. */
export async function reconcileSocialIdentities(user: User): Promise<LinkedSocialUser> {
  const admin = createAdminClient();
  if (!admin) {
    return { user, switched: false, tokenHash: null };
  }

  const emails = collectAuthEmails(user);
  const canonical =
    emails.length > 0 ? pickCanonicalUser(await usersByEmails(admin, emails)) : null;

  if (!canonical || canonical.id === user.id) {
    await upsertAppProfile(admin, {
      id: user.id,
      email: emails[0] ?? user.email,
      name: displayNameOf(user),
    });
    return { user, switched: false, tokenHash: null };
  }

  try {
    const merged = await mergeUserInto(user, canonical);
    const tokenHash = await generateMagicLinkHash(admin, merged);
    return { user: merged, switched: true, tokenHash };
  } catch (error) {
    console.error('[SponsorAuction] 동일 이메일 계정 자동 통합 실패', error);
    await upsertAppProfile(admin, {
      id: user.id,
      email: emails[0] ?? user.email,
      name: displayNameOf(user),
    });
    return { user, switched: false, tokenHash: null };
  }
}
