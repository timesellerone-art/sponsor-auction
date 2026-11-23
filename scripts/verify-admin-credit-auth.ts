import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '../src/types/database';

const EMAIL = 'credit-ledger-auth@clink.internal';
const NAME = '원장 인증 검증';
const ORIGIN = 'http://127.0.0.1:3000';

type Client = SupabaseClient<Database>;

function loadEnv() {
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

async function ensureUser(admin: Client, password: string) {
  let userId: string | null = null;
  for (let page = 1; page <= 20; page += 1) {
    const listed = await admin.auth.admin.listUsers({ page, perPage: 200 });
    const match = (listed.data.users ?? []).find(
      (user) => user.email?.trim().toLowerCase() === EMAIL,
    );
    if (match) {
      userId = match.id;
      break;
    }
    if ((listed.data.users ?? []).length < 200) {
      break;
    }
  }
  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { name: NAME, role: 'advertiser', roles: ['advertiser'] },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? '검증 계정을 만들지 못했습니다.');
    }
    userId = created.data.user.id;
  } else {
    const updated = await admin.auth.admin.updateUserById(userId, { password });
    if (updated.error) {
      throw new Error(updated.error.message);
    }
  }
  const profile = await admin.from('profiles').upsert(
    {
      id: userId,
      name: NAME,
      email: EMAIL,
      role: 'advertiser',
      roles: ['advertiser'],
      status: 'active',
    },
    { onConflict: 'id' },
  );
  if (profile.error) {
    throw new Error(profile.error.message);
  }
  return userId;
}

async function signIn(url: string, anonKey: string, password: string) {
  const jar = new Map<string, string>();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return [...jar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookies: Array<{ name: string; value: string; options?: CookieOptions }>) {
        for (const cookie of cookies) {
          jar.set(cookie.name, cookie.value);
        }
      },
    },
  });
  const signed = await supabase.auth.signInWithPassword({ email: EMAIL, password });
  if (signed.error || !signed.data.session) {
    throw new Error(signed.error?.message ?? '검증 계정으로 로그인하지 못했습니다.');
  }
  const cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  if (!cookie) {
    throw new Error('로그인 세션 쿠키를 받지 못했습니다.');
  }
  return cookie;
}

async function callCredits(
  cookie: string,
  init: { method?: string; body?: string; staleBearer?: boolean; query?: string },
) {
  const headers = new Headers({ cookie });
  if (init.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (init.staleBearer) {
    headers.set('Authorization', 'Bearer stale-credit-ledger-token');
  }
  const response = await fetch(
    `${ORIGIN}/api/admin/credits${init.query ? `?q=${encodeURIComponent(init.query)}` : ''}`,
    {
      method: init.method ?? 'GET',
      headers,
      body: init.body,
      cache: 'no-store',
    },
  );
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    errorCode?: string;
    data?: unknown;
    userId?: string | null;
  } | null;
  return { status: response.status, errorCode: body?.errorCode ?? null, error: body?.error ?? null, userId: body?.userId ?? null };
}

async function main() {
  const env = loadEnv();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !serviceKey || !anonKey) {
    throw new Error('Supabase URL 또는 키가 없습니다.');
  }
  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const password = `ledger-auth-${crypto.randomUUID()}`;
  const userId = await ensureUser(admin, password);
  const cookie = await signIn(url, anonKey, password);
  const anonymous = await callCredits('', { query: EMAIL });
  const staleAdvertiser = await callCredits(cookie, { staleBearer: true, query: EMAIL });
  const promoted = await admin
    .from('profiles')
    .update({ role: 'admin', roles: ['admin'] })
    .eq('id', userId);
  if (promoted.error) {
    throw new Error(promoted.error.message);
  }
  let staleAdmin: Awaited<ReturnType<typeof callCredits>> | null = null;
  let adjust: Awaited<ReturnType<typeof callCredits>> | null = null;
  try {
    staleAdmin = await callCredits(cookie, { staleBearer: true, query: EMAIL });
    adjust = await callCredits(cookie, {
      method: 'POST',
      staleBearer: true,
      body: JSON.stringify({ userId, amount: 0, action: 'grant' }),
    });
  } finally {
    const restored = await admin
      .from('profiles')
      .update({ role: 'advertiser', roles: ['advertiser'] })
      .eq('id', userId)
      .select('role')
      .maybeSingle();
    const report = {
      anonymousStatus: anonymous.status,
      anonymousCode: anonymous.errorCode,
      loggedInWithoutAdminStatus: staleAdvertiser.status,
      loggedInWithoutAdminCode: staleAdvertiser.errorCode,
      adminLookupStatus: staleAdmin?.status ?? null,
      adminLookupCode: staleAdmin?.errorCode ?? null,
      adminLookupUserMatched: staleAdmin?.userId === userId,
      adminAdjustStatus: adjust?.status ?? null,
      adminAdjustCode: adjust?.errorCode ?? null,
      restoredRole: restored.data?.role ?? restored.error?.message ?? null,
    };
    console.log(JSON.stringify(report, null, 2));
    const ok =
      anonymous.status === 401 &&
      anonymous.errorCode === 'UNAUTHORIZED' &&
      staleAdvertiser.status === 403 &&
      staleAdvertiser.errorCode === 'FORBIDDEN' &&
      staleAdmin?.status === 200 &&
      staleAdmin.errorCode === null &&
      staleAdmin.userId === userId &&
      adjust?.status === 400 &&
      adjust.errorCode === null &&
      restored.data?.role === 'advertiser';
    if (!ok) {
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '원장 인증 검증에 실패했습니다.');
  process.exitCode = 1;
});
