import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { creatorSettlementFromRow } from '../src/lib/settlement-account';
import type { Database } from '../src/types/database';

const EMAIL = 'credit-nav-creator@clink.internal';
const COLUMNS = 'bank_name, account_number, account_holder, settlement_type';

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

function isSchemaMismatch(error: { message?: string; code?: string } | null | undefined) {
  const message = error?.message ?? '';
  const code = error?.code ?? '';
  return (
    code === 'PGRST204' ||
    /could not find the .* column/i.test(message) ||
    /column .* does not exist/i.test(message) ||
    /schema cache/i.test(message)
  );
}

async function findUserId(client: Client) {
  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.auth.admin.listUsers({ page, perPage: 200 });
    const match = (listed.data.users ?? []).find(
      (user) => user.email?.trim().toLowerCase() === EMAIL,
    );
    if (match) {
      return match.id;
    }
    if ((listed.data.users ?? []).length < 200) {
      break;
    }
  }
  return null;
}

async function main() {
  const env = loadEnv();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) {
    throw new Error('Supabase 설정이 없습니다.');
  }
  const client = createClient<Database>(url, key, { auth: { persistSession: false } });
  const userId = await findUserId(client);
  if (!userId) {
    throw new Error('검증용 크리에이터 계정을 찾지 못했습니다.');
  }

  const before = await client.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle();
  if (before.error && isSchemaMismatch(before.error)) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          code: 'SCHEMA_MISSING',
          message: 'profiles 정산 계좌 컬럼이 없습니다. supabase/migrations/20261125_creator_settlement_account.sql 적용이 필요합니다.',
        },
        null,
        2,
      ),
    );
    return;
  }
  if (before.error || !before.data) {
    throw new Error(before.error?.message || '프로필을 읽지 못했습니다.');
  }

  const original = creatorSettlementFromRow(before.data);
  const probe = {
    bank_name: '카카오뱅크',
    account_number: '3333123456789',
    account_holder: '정산검증',
    settlement_type: 'business' as const,
  };
  const saved = await client.from('profiles').update(probe).eq('id', userId).select(COLUMNS).maybeSingle();
  if (saved.error || !saved.data) {
    throw new Error(saved.error?.message || '정산 계좌를 저장하지 못했습니다.');
  }
  const loaded = creatorSettlementFromRow(saved.data);
  const restored = await client
    .from('profiles')
    .update({
      bank_name: original.bankName,
      account_number: original.accountNumber,
      account_holder: original.accountHolder,
      settlement_type: original.settlementType,
    })
    .eq('id', userId)
    .select(COLUMNS)
    .maybeSingle();
  if (restored.error) {
    throw new Error(restored.error.message);
  }

  const ok =
    loaded.bankName === '카카오뱅크' &&
    loaded.accountNumber === '3333123456789' &&
    loaded.accountHolder === '정산검증' &&
    loaded.settlementType === 'business';
  console.log(
    JSON.stringify(
      {
        ok,
        email: EMAIL,
        saved: {
          bankName: loaded.bankName,
          accountHolder: loaded.accountHolder,
          settlementType: loaded.settlementType,
          accountDigits: loaded.accountNumber.length,
        },
        restoredType: creatorSettlementFromRow(restored.data ?? {}).settlementType,
      },
      null,
      2,
    ),
  );
  if (!ok) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
