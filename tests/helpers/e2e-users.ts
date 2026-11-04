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

export const DEMO_E2E_ACCOUNTS = [
  {
    email: 'admin@demo.com',
    name: '데모 관리자',
    role: 'admin' as const,
    roles: ['admin'] as const,
    mode: null,
  },
  {
    email: 'brand@demo.com',
    name: '데모 광고주',
    role: 'advertiser' as const,
    roles: ['advertiser', 'creator'] as const,
    mode: 'advertiser' as const,
  },
  {
    email: 'creator@demo.com',
    name: '데모 크리에이터',
    role: 'creator' as const,
    roles: ['creator'] as const,
    mode: 'creator' as const,
  },
] as const;

export const DEMO_E2E_PASSWORD = 'demo1234';

function isE2EDemoUser(user: User) {
  if (user.user_metadata?.e2e_demo === true) {
    return true;
  }
  const email = user.email?.trim().toLowerCase() ?? '';
  return DEMO_E2E_ACCOUNTS.some((account) => account.email === email);
}

export async function ensureDemoAccounts(admin?: SupabaseClient | null) {
  const client = admin ?? e2eAdminClient();
  if (!client) {
    throw new Error(
      'E2E 데모 계정을 만들 SUPABASE_SERVICE_ROLE_KEY가 없습니다. .env.local을 확인하세요.',
    );
  }

  const byEmail = new Map<string, User>();
  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.auth.admin.listUsers({ page, perPage: 200 });
    const rows = listed.data.users ?? [];
    if (rows.length === 0) {
      break;
    }
    for (const user of rows) {
      const email = user.email?.trim().toLowerCase() ?? '';
      if (email) {
        byEmail.set(email, user);
      }
    }
    if (rows.length < 200) {
      break;
    }
  }

  for (const account of DEMO_E2E_ACCOUNTS) {
    const metadata = {
      name: account.name,
      role: account.role,
      roles: [...account.roles],
      current_mode: account.mode,
      onboarding_complete: true,
      e2e_demo: true,
    };
    const existing = byEmail.get(account.email);
    const result = existing
      ? await client.auth.admin.updateUserById(existing.id, {
          password: DEMO_E2E_PASSWORD,
          email_confirm: true,
          user_metadata: metadata,
        })
      : await client.auth.admin.createUser({
          email: account.email,
          password: DEMO_E2E_PASSWORD,
          email_confirm: true,
          user_metadata: metadata,
        });
    if (result.error || !result.data.user) {
      throw new Error(`${account.email} 준비 실패: ${result.error?.message ?? 'unknown'}`);
    }

    const profile = await client.from('profiles').upsert(
      {
        id: result.data.user.id,
        name: account.name,
        email: account.email,
        role: account.role,
        roles: [...account.roles],
        status: 'active',
      },
      { onConflict: 'id' },
    );
    if (profile.error) {
      throw new Error(`${account.email} 프로필 저장 실패: ${profile.error.message}`);
    }
  }
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

export async function cleanupDemoAccounts(admin?: SupabaseClient | null) {
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
      if (!user || !isE2EDemoUser(user)) {
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
