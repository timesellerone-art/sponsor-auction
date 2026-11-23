import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listPayoutsFromDatabase } from '../src/lib/payouts';
import type { Database } from '../src/types/database';

const ADMIN_EMAIL = 'payout-hold-admin@clink.internal';
const ADMIN_NAME = '정산보류 관리자검증';
const ORDER = 'payout-hold-test-1e2bb36d';
const TITLE = '[검증] 정산 보류 테스트 캠페인';
const ORIGIN = 'http://127.0.0.1:3000';

type Client = SupabaseClient<Database>;

function loadEnv() {
  const values: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index <= 0 || line.trim().startsWith('#')) continue;
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim().replace(/^"|"$/g, '');
      if (!values[key]) values[key] = value;
    }
  } catch {
    // process.env만 사용한다.
  }
  return values;
}

async function ensureAdmin(client: Client, password: string) {
  let userId: string | null = null;
  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.auth.admin.listUsers({ page, perPage: 200 });
    const match = (listed.data.users ?? []).find(
      (user) => user.email?.trim().toLowerCase() === ADMIN_EMAIL,
    );
    if (match) {
      userId = match.id;
      break;
    }
    if ((listed.data.users ?? []).length < 200) break;
  }
  if (!userId) {
    const created = await client.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password,
      email_confirm: true,
      user_metadata: { name: ADMIN_NAME, role: 'admin', roles: ['admin'] },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? '관리자 검증 계정을 만들지 못했습니다.');
    }
    userId = created.data.user.id;
  } else {
    const updated = await client.auth.admin.updateUserById(userId, {
      password,
      user_metadata: { name: ADMIN_NAME, role: 'admin', roles: ['admin'] },
    });
    if (updated.error) throw new Error(updated.error.message);
  }
  const profile = await client.from('profiles').upsert(
    {
      id: userId,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      role: 'admin',
      roles: ['admin'],
      status: 'active',
    },
    { onConflict: 'id' },
  );
  if (profile.error) throw new Error(profile.error.message);
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
        for (const cookie of cookies) jar.set(cookie.name, cookie.value);
      },
    },
  });
  const signed = await supabase.auth.signInWithPassword({ email: ADMIN_EMAIL, password });
  if (signed.error || !signed.data.session) {
    throw new Error(signed.error?.message ?? '관리자 로그인에 실패했습니다.');
  }
  jar.set('sponsor-auction-role', 'admin');
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function main() {
  const env = loadEnv();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  if (!url || !serviceKey || !anonKey) {
    throw new Error('Supabase URL 또는 키가 없습니다.');
  }
  const client = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const direct = await client
    .from('payouts')
    .select('id, status, payment_order_id, auction_title, amount')
    .eq('payment_order_id', ORDER)
    .maybeSingle();
  if (!direct.data) {
    throw new Error('테스트 정산 행이 DB에 없습니다. scripts/seed-payout-hold-test.ts 를 실행하세요.');
  }
  if (direct.data.status !== 'pending' && direct.data.status !== 'hold') {
    await client.from('payouts').update({ status: 'pending', paid_at: null }).eq('id', direct.data.id);
  }

  const listed = await listPayoutsFromDatabase(client);
  const mappedHit = listed.find(
    (item) => item.paymentOrderId === ORDER || item.auctionTitle === TITLE,
  );

  const password = `payout-list-${crypto.randomUUID()}`;
  await ensureAdmin(client, password);
  const cookie = await signIn(url, anonKey, password);
  const response = await fetch(`${ORIGIN}/api/admin/payouts`, {
    headers: { cookie, 'Cache-Control': 'no-store' },
    cache: 'no-store',
  });
  const body = (await response.json().catch(() => null)) as {
    data?: Array<{ paymentOrderId?: string | null; auctionTitle?: string; status?: string; amount?: number }>;
    error?: string;
  } | null;
  const apiHit = (body?.data ?? []).find(
    (item) => item.paymentOrderId === ORDER || item.auctionTitle === TITLE,
  );

  const report = {
    supabaseHost: new URL(url).host,
    dbRow: direct.data,
    mappedFound: Boolean(mappedHit),
    mappedStatus: mappedHit?.status ?? null,
    apiStatus: response.status,
    apiError: body?.error ?? null,
    apiCount: body?.data?.length ?? 0,
    apiFound: Boolean(apiHit),
    apiHitStatus: apiHit?.status ?? null,
    apiHitAmount: apiHit?.amount ?? null,
  };
  console.log(JSON.stringify(report, null, 2));
  const ok =
    Boolean(direct.data) &&
    mappedHit?.status === 'pending' &&
    response.status === 200 &&
    apiHit?.status === 'pending';
  if (!ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '정산 목록 검증에 실패했습니다.');
  process.exitCode = 1;
});
