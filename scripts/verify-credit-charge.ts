import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createCreditChargeOrder,
  loadCreditChargeOrder,
  settleCreditCharge,
} from '../src/lib/credit-charge';
import {
  CREDIT_LEDGER_TEST_EMAIL,
  ensureCreditLedgerTestUser,
  getCreditBalance,
  listCreditTransactions,
  snapshotCampaignInventory,
  snapshotOtherProfileCredits,
  summarizeCreditTransactions,
} from '../src/lib/credits';
import type { Database } from '../src/types/database';

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

function log(label: string, detail: unknown) {
  console.log(`[credit-charge] ${label}`);
  console.log(JSON.stringify(detail, null, 2));
}

async function main() {
  const env = loadEnv();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
  const key = (env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!/^https?:\/\//i.test(url) || key.length < 20) {
    throw new Error('운영 Supabase URL과 서비스 롤 키가 필요합니다.');
  }
  const admin = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  console.log('[credit-charge] supabase host', new URL(url).host);

  const probe = await admin.from('credit_charge_orders').select('order_id').limit(1);
  if (probe.error) {
    throw new Error(
      `credit_charge_orders 가 없습니다 (${probe.error.message}). supabase/migrations/20261120_credit_charge_orders.sql 을 운영 SQL 편집기에서 실행한 뒤 다시 돌려 주세요.`,
    );
  }

  const user = await ensureCreditLedgerTestUser(admin);
  if (user.email !== CREDIT_LEDGER_TEST_EMAIL) {
    throw new Error('검증 계정이 아닙니다.');
  }
  console.log('[credit-charge] test user', user);

  const othersBefore = await snapshotOtherProfileCredits(admin, user.id);
  const inventoryBefore = await snapshotCampaignInventory(admin);
  const balanceBefore = await getCreditBalance(admin, user.id);
  const txBefore = (await listCreditTransactions(admin, user.id)).length;
  log('before', { balance: balanceBefore, transactionCount: txBefore });

  const created = await createCreditChargeOrder(admin, user.id, 10_000);
  if (!created.ok) {
    throw new Error(created.message);
  }
  const paymentKey = `credit-charge-verify-${Date.now().toString(36)}`;
  const first = await settleCreditCharge(admin, {
    userId: user.id,
    orderId: created.order.orderId,
    paymentKey,
    paidAmount: created.order.amount,
    outcome: 'confirmed',
  });
  const afterFirst = {
    balance: await getCreditBalance(admin, user.id),
    transactionCount: (await listCreditTransactions(admin, user.id)).length,
    order: await loadCreditChargeOrder(admin, created.order.orderId),
  };
  log('confirm', { response: first, ...afterFirst });

  const second = await settleCreditCharge(admin, {
    userId: user.id,
    orderId: created.order.orderId,
    paymentKey,
    paidAmount: created.order.amount,
    outcome: 'confirmed',
  });
  const afterSecond = {
    balance: await getCreditBalance(admin, user.id),
    transactionCount: (await listCreditTransactions(admin, user.id)).length,
  };
  log('duplicate confirm', { response: second, ...afterSecond });

  const mismatchOrder = await createCreditChargeOrder(admin, user.id, 10_000);
  if (!mismatchOrder.ok) {
    throw new Error(mismatchOrder.message);
  }
  const mismatch = await settleCreditCharge(admin, {
    userId: user.id,
    orderId: mismatchOrder.order.orderId,
    paymentKey: `credit-charge-mismatch-${Date.now().toString(36)}`,
    paidAmount: 9_999,
    outcome: 'confirmed',
  });
  const afterMismatch = {
    balance: await getCreditBalance(admin, user.id),
    transactionCount: (await listCreditTransactions(admin, user.id)).length,
    order: await loadCreditChargeOrder(admin, mismatchOrder.order.orderId),
  };
  log('amount mismatch', { response: mismatch, ...afterMismatch });

  const failedOrder = await createCreditChargeOrder(admin, user.id, 30_000);
  if (!failedOrder.ok) {
    throw new Error(failedOrder.message);
  }
  const failed = await settleCreditCharge(admin, {
    userId: user.id,
    orderId: failedOrder.order.orderId,
    paymentKey: '',
    paidAmount: 0,
    outcome: 'cancelled',
  });
  const afterFailed = {
    balance: await getCreditBalance(admin, user.id),
    transactionCount: (await listCreditTransactions(admin, user.id)).length,
    order: await loadCreditChargeOrder(admin, failedOrder.order.orderId),
  };
  log('cancel', { response: failed, ...afterFailed });

  const othersAfter = await snapshotOtherProfileCredits(admin, user.id);
  const inventoryAfter = await snapshotCampaignInventory(admin);
  const ledger = summarizeCreditTransactions(await listCreditTransactions(admin, user.id));
  log('final', {
    email: CREDIT_LEDGER_TEST_EMAIL,
    balance: afterFailed.balance,
    ledger,
    othersUnchanged: JSON.stringify(othersBefore) === JSON.stringify(othersAfter),
    campaignsUnchanged: inventoryBefore.checksum === inventoryAfter.checksum,
    inventoryBefore,
    inventoryAfter,
  });

  const passed =
    first.ok &&
    first.charged &&
    first.code === 'CHARGED' &&
    afterFirst.balance === (balanceBefore ?? 0) + 10_000 &&
    afterFirst.transactionCount === txBefore + 1 &&
    afterFirst.order?.status === 'confirmed' &&
    afterFirst.order.paymentKey === paymentKey &&
    second.ok &&
    second.duplicate &&
    second.code === 'DUPLICATE_REFERENCE' &&
    afterSecond.balance === afterFirst.balance &&
    afterSecond.transactionCount === afterFirst.transactionCount &&
    !mismatch.ok &&
    mismatch.code === 'AMOUNT_MISMATCH' &&
    afterMismatch.balance === afterFirst.balance &&
    afterMismatch.transactionCount === afterFirst.transactionCount &&
    afterMismatch.order?.status === 'pending' &&
    failed.ok &&
    failed.code === 'CLOSED' &&
    failed.charged === false &&
    afterFailed.balance === afterFirst.balance &&
    afterFailed.transactionCount === afterFirst.transactionCount &&
    afterFailed.order?.status === 'cancelled' &&
    JSON.stringify(othersBefore) === JSON.stringify(othersAfter) &&
    inventoryBefore.checksum === inventoryAfter.checksum;

  if (!passed) {
    throw new Error('크레딧 충전 승인 검증이 실패했습니다.');
  }
  console.log('[credit-charge] all scenarios passed');
}

void main().catch((error) => {
  console.error('[credit-charge] failed', error);
  process.exit(1);
});
