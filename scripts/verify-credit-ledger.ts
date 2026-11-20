import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '../src/types/database';
import {
  CREDIT_LEDGER_TEST_EMAIL,
  ensureCreditLedgerTestUser,
  resetCreditLedger,
  runCreditLedgerScenarios,
} from '../src/lib/credits';

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

async function main() {
  const env = loadEnv();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = (
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  if (!/^https?:\/\//i.test(url) || key.length < 20) {
    throw new Error('운영과 같은 Supabase URL/서비스 롤 키가 필요합니다.');
  }

  const admin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('[credit-ledger] supabase host', new URL(url).host);
  const schema = await admin.from('profiles').select('credit_balance').limit(1);
  if (schema.error) {
    throw new Error(
      `크레딧 스키마가 아직 없습니다 (${schema.error.message}). supabase/migrations/20261120_credit_ledger.sql 을 운영 SQL 편집기에서 실행한 뒤 다시 돌려 주세요.`,
    );
  }
  const user = await ensureCreditLedgerTestUser(admin);
  console.log('[credit-ledger] test user', { id: user.id, email: CREDIT_LEDGER_TEST_EMAIL });

  await resetCreditLedger(admin, user.id);
  const scenarios = await runCreditLedgerScenarios(admin, user.id);

  for (const scenario of scenarios) {
    console.log(
      `[credit-ledger] ${scenario.passed ? 'PASS' : 'FAIL'} ${scenario.id}. ${scenario.title}`,
    );
    console.log(JSON.stringify(scenario.detail, null, 2));
  }

  const passed = scenarios.every((item) => item.passed);
  if (!passed) {
    process.exitCode = 1;
    throw new Error('크레딧 원장 검증 시나리오가 실패했습니다.');
  }
  console.log('[credit-ledger] all scenarios passed');
}

void main().catch((error) => {
  console.error('[credit-ledger] failed', error);
  process.exit(1);
});
