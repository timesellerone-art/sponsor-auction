import type { SupabaseClient, User } from '@supabase/supabase-js';
import { normalizeContactEmail, normalizePhone } from './contact';

type AdminClient = SupabaseClient;

export type ContactLookupInput = {
  emails?: Array<string | null | undefined>;
  phone?: string | null;
  naverId?: string | null;
};

function uniqueIds(values: Array<string | null | undefined>) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const id = value?.trim() ?? '';
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function profileIdsByEmail(admin: AdminClient, email: string) {
  const result = await admin.from('profiles').select('id').eq('email', email);
  return (result.data ?? []).map((row) => row.id);
}

async function profileIdsByPhone(admin: AdminClient, phone: string) {
  const result = await admin.from('profiles').select('id').eq('phone', phone);
  return (result.data ?? []).map((row) => row.id);
}

let contactRpcAvailable = true;

async function rpcUserIds(admin: AdminClient, input: { emails: string[]; phone: string; naverId: string }) {
  if (!contactRpcAvailable) {
    return [] as string[];
  }
  const result = await admin.rpc('find_auth_user_ids_by_contact', {
    p_emails: input.emails,
    p_phone: input.phone || null,
    p_naver_id: input.naverId || null,
  });
  if (result.error) {
    if (result.error.code === 'PGRST202') {
      contactRpcAvailable = false;
    }
    return [] as string[];
  }
  return (result.data ?? [])
    .map((row: { id?: string } | null) => (row?.id ? String(row.id) : ''))
    .filter(Boolean);
}

async function usersByIds(admin: AdminClient, ids: string[]) {
  const fetched = await Promise.all(
    ids.slice(0, 20).map((id) => admin.auth.admin.getUserById(id)),
  );
  return fetched
    .map((item) => item.data.user)
    .filter((user): user is User => Boolean(user));
}

/** profiles 인덱스 + 연락처 RPC로 후보만 가져온다. auth.users 전체 스캔은 하지 않는다. */
export async function lookupUsersByContact(
  admin: AdminClient,
  input: ContactLookupInput,
): Promise<User[]> {
  const emails = uniqueIds(
    (input.emails ?? []).map((value) => normalizeContactEmail(value) || (value?.trim().toLowerCase() ?? '')),
  ).filter((email) => email.includes('@'));
  const phone = normalizePhone(input.phone);
  const naverId = input.naverId?.trim() ?? '';
  const placeholder = naverId ? `naver.${naverId}@oauth.sponsor-auction.local` : '';
  const lookupEmails = uniqueIds([...emails, placeholder]);

  if (lookupEmails.length === 0 && !phone && !naverId) {
    return [];
  }

  const tasks: Array<Promise<string[]>> = [
    rpcUserIds(admin, { emails: lookupEmails, phone, naverId }),
  ];
  for (const email of lookupEmails) {
    tasks.push(profileIdsByEmail(admin, email));
  }
  if (phone) {
    tasks.push(profileIdsByPhone(admin, phone));
  }

  const groups = await Promise.all(tasks);
  return usersByIds(admin, uniqueIds(groups.flat()));
}
