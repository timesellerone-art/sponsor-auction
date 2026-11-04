import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export function readE2EEnv() {
  const values: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index <= 0 || line.trim().startsWith('#')) {
        continue;
      }
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^"|"$/g, '');
      if (!values[key]) {
        values[key] = value;
      }
    }
  } catch {
    // process.env만 사용한다.
  }
  return values;
}

export function e2eAdminClient(): SupabaseClient | null {
  const env = readE2EEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const key = (
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  if (!/^https?:\/\//i.test(url) || key.length < 20) {
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isE2EEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? '';
  if (!value) {
    return false;
  }
  return (
    value.endsWith('@sponsor-auction.test') ||
    value.startsWith('e2e.') ||
    /^naver\.e2e\./.test(value) ||
    /^naver\.[a-z0-9._-]+@oauth\.sponsor-auction\.local$/.test(value) ||
    /^kakao\.[a-z0-9-]+@oauth\.sponsor-auction\.local$/.test(value) ||
    /^google\.[a-z0-9-]+@oauth\.sponsor-auction\.local$/.test(value) ||
    /^user\.[0-9a-f]+k@oauth\.sponsor-auction\.local$/.test(value)
  );
}

function providerNames(user: User) {
  return [
    ...(user.identities ?? []).map((item) => item.provider),
    ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []),
  ].filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function isPlaceholderIdentityEmail(email: string | null | undefined) {
  const value = email?.trim().toLowerCase() ?? '';
  return !value || !value.includes('@') || value.endsWith('@oauth.sponsor-auction.local');
}

function isDummySocialOnly(user: User) {
  const providers = providerNames(user);
  const hasKakao = providers.includes('kakao');
  const hasNaver = providers.includes('naver') || providers.includes('custom:naver');
  const hasGoogle = providers.includes('google');
  const noEmail = isPlaceholderIdentityEmail(user.email);
  const noPhone = !(user.phone && String(user.phone).replace(/\D/g, '').length >= 10);
  if (!noEmail || !noPhone) {
    return false;
  }
  if (hasKakao && !hasGoogle && !hasNaver) {
    return true;
  }
  if (hasNaver && !hasGoogle && !hasKakao) {
    return true;
  }
  return hasGoogle && !hasKakao && !hasNaver;
}

export async function deleteAuthUser(admin: SupabaseClient, userId: string) {
  await admin.auth.admin.deleteUser(userId);
  await admin.from('profiles').delete().eq('id', userId);
}

export async function cleanupE2EUsers(admin?: SupabaseClient | null) {
  const client = admin ?? e2eAdminClient();
  if (!client) {
    return 0;
  }
  const ids: string[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.auth.admin.listUsers({ page, perPage: 200 });
    const rows = listed.data.users ?? [];
    if (rows.length === 0) {
      break;
    }
    for (const row of rows) {
      const user = (await client.auth.admin.getUserById(row.id)).data.user;
      if (!user) {
        continue;
      }
      if (!isE2EEmail(user.email) && !isDummySocialOnly(user)) {
        continue;
      }
      ids.push(user.id);
    }
    if (rows.length < 200) {
      break;
    }
  }
  for (const id of [...new Set(ids)]) {
    await deleteAuthUser(client, id);
  }
  return ids.length;
}
