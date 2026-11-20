import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Database } from '../src/types/database';
import {
  CREDIT_LEDGER_TEST_EMAIL,
  ensureCreditLedgerTestUser,
  getCreditBalance,
  listCreditTransactions,
  resetCreditLedger,
  runCreditLedgerHardeningScenarios,
  snapshotCampaignInventory,
  snapshotOtherProfileCredits,
  summarizeCreditTransactions,
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

  console.log('[credit-hardening] supabase host', new URL(url).host);

  const schema = await admin.from('profiles').select('credit_balance').limit(1);
  if (schema.error) {
    throw new Error(
      `크레딧 스키마가 아직 없습니다 (${schema.error.message}). supabase/migrations/20261120_credit_ledger.sql 을 운영 SQL 편집기에서 실행한 뒤 다시 돌려 주세요.`,
    );
  }

  const restoreProbe = await admin.rpc('restore_user_credit', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_amount: 1,
    p_type: 'RELEASE',
  });
  const restoreMissing =
    Boolean(restoreProbe.error?.message?.includes('Could not find the function')) ||
    Boolean(restoreProbe.error?.message?.includes('schema cache'));
  if (restoreMissing) {
    throw new Error(
      'restore_user_credit 가 없습니다. supabase/migrations/20261120_credit_ledger_restore.sql 을 운영 SQL 편집기에서 실행한 뒤 다시 돌려 주세요.',
    );
  }

  const user = await ensureCreditLedgerTestUser(admin);
  if (user.email !== CREDIT_LEDGER_TEST_EMAIL) {
    throw new Error('검증 계정 이메일이 일치하지 않아 중단합니다.');
  }
  console.log('[credit-hardening] test user', { id: user.id, email: CREDIT_LEDGER_TEST_EMAIL });

  const othersBeforeReset = await snapshotOtherProfileCredits(admin, user.id);
  const inventoryBeforeReset = await snapshotCampaignInventory(admin);
  await resetCreditLedger(admin, user.id);
  const othersAfterReset = await snapshotOtherProfileCredits(admin, user.id);
  const inventoryAfterReset = await snapshotCampaignInventory(admin);
  if (
    JSON.stringify(othersBeforeReset) !== JSON.stringify(othersAfterReset) ||
    inventoryBeforeReset.checksum !== inventoryAfterReset.checksum
  ) {
    throw new Error('검증 계정 원장 초기화가 다른 프로필 또는 캠페인을 변경했습니다.');
  }

  const scenarios = await runCreditLedgerHardeningScenarios(admin, user.id);
  for (const scenario of scenarios) {
    console.log(
      `[credit-hardening] ${scenario.passed ? 'PASS' : 'FAIL'} ${scenario.id}. ${scenario.title}`,
    );
    console.log(JSON.stringify(scenario.detail, null, 2));
  }

  const finalBalance = await getCreditBalance(admin, user.id);
  const finalTransactions = summarizeCreditTransactions(await listCreditTransactions(admin, user.id));
  const othersFinal = await snapshotOtherProfileCredits(admin, user.id);
  const inventoryFinal = await snapshotCampaignInventory(admin);

  console.log('[credit-hardening] final test profile', {
    id: user.id,
    email: CREDIT_LEDGER_TEST_EMAIL,
    credit_balance: finalBalance,
  });
  console.log('[credit-hardening] final credit_transactions');
  console.log(JSON.stringify(finalTransactions, null, 2));
  console.log('[credit-hardening] other profiles');
  console.log(JSON.stringify(othersFinal, null, 2));
  console.log('[credit-hardening] campaign inventory', inventoryFinal);

  const passed = scenarios.every((item) => item.passed);
  if (!passed) {
    process.exitCode = 1;
    throw new Error('크레딧 원장 고강도 검증 시나리오가 실패했습니다.');
  }
  console.log('[credit-hardening] all scenarios passed');
}

void main().catch((error) => {
  console.error('[credit-hardening] failed', error);
  process.exit(1);
});
