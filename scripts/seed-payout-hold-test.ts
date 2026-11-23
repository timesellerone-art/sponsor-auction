import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { settlementDueAtIso } from '../src/lib/business-days';
import { creatorPayoutAmount } from '../src/lib/fees';
import { setPayoutHold } from '../src/lib/payouts';
import type { Database } from '../src/types/database';

const EMAIL = 'payout-hold-flow@clink.internal';
const NAME = '정산보류검증 크리에이터';
const TITLE = '[검증] 정산 보류 테스트 캠페인';
const BID_AMOUNT = 100_000;
const ORDER_PREFIX = 'payout-hold-test';

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

async function ensureUser(client: Client) {
  let userId: string | null = null;
  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.auth.admin.listUsers({ page, perPage: 200 });
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
    const created = await client.auth.admin.createUser({
      email: EMAIL,
      password: `payout-hold-${crypto.randomUUID()}`,
      email_confirm: true,
      user_metadata: { name: NAME, role: 'creator', roles: ['creator'] },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? '검증 계정을 만들지 못했습니다.');
    }
    userId = created.data.user.id;
  }
  const profile = await client.from('profiles').upsert(
    {
      id: userId,
      name: NAME,
      email: EMAIL,
      role: 'creator',
      roles: ['creator'],
      status: 'active',
    },
    { onConflict: 'id' },
  );
  if (profile.error) {
    throw new Error(profile.error.message);
  }
  return userId;
}

async function main() {
  const env = loadEnv();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('Supabase URL 또는 서비스 롤 키가 없습니다.');
  }
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userId = await ensureUser(client);
  const paymentOrderId = `${ORDER_PREFIX}-${userId.slice(0, 8)}`;
  const requestedAt = new Date().toISOString();
  const bankAccount = '국민은행 / 123456789012 / 정산보류검증';
  const amount = creatorPayoutAmount(BID_AMOUNT);

  const existing = await client
    .from('payouts')
    .select('id, status, payment_order_id, amount, creator_email, auction_title')
    .eq('payment_order_id', paymentOrderId)
    .maybeSingle();

  let payoutId = existing.data?.id ?? '';
  if (!existing.data) {
    const insertCore = {
      creator_id: userId,
      creator_name: NAME,
      creator_email: EMAIL,
      amount,
      status: 'pending' as const,
      auction_title: TITLE,
      requested_at: requestedAt,
      paid_at: null,
      payment_order_id: paymentOrderId,
      auction_id: null,
      bid_id: null,
      admin_memo: '정산 보류 UI 검증용. 기존 운영 데이터와 무관합니다.',
      bank_account: bankAccount,
    };
    const withBank = {
      ...insertCore,
      bank_name: '국민은행',
      account_number: '123456789012',
      account_holder: '정산보류검증',
      settlement_due_at: settlementDueAtIso(requestedAt, 4),
    };
    let inserted = await client.from('payouts').insert(withBank).select('id, status, payment_order_id').maybeSingle();
    if (inserted.error) {
      inserted = await client.from('payouts').insert(insertCore).select('id, status, payment_order_id').maybeSingle();
    }
    if (inserted.error || !inserted.data) {
      throw new Error(inserted.error?.message ?? '테스트 정산을 만들지 못했습니다.');
    }
    payoutId = inserted.data.id;
  } else if (existing.data.status !== 'pending') {
    const reset = await client
      .from('payouts')
      .update({ status: 'pending', paid_at: null })
      .eq('id', existing.data.id)
      .select('id, status')
      .maybeSingle();
    if (reset.error) {
      throw new Error(reset.error.message);
    }
    payoutId = existing.data.id;
  }

  const holdByOrder = await setPayoutHold(client, { id: paymentOrderId, hold: true });
  const afterHold = await client.from('payouts').select('id, status').eq('id', payoutId).maybeSingle();
  const releaseByOrder = holdByOrder.ok
    ? await setPayoutHold(client, { id: paymentOrderId, hold: false })
    : { ok: false as const, message: holdByOrder.message };
  const afterRelease = await client.from('payouts').select('id, status').eq('id', payoutId).maybeSingle();

  // UI에서 보류 버튼을 바로 누를 수 있도록 지급 대기로 둔다.
  if (afterRelease.data?.status !== 'pending') {
    await client.from('payouts').update({ status: 'pending', paid_at: null }).eq('id', payoutId);
  }

  const finalRow = await client
    .from('payouts')
    .select('id, status, payment_order_id, amount, creator_name, creator_email, auction_title, bank_account')
    .eq('id', payoutId)
    .maybeSingle();

  const report = {
    payoutId,
    paymentOrderId,
    creatorEmail: EMAIL,
    auctionTitle: TITLE,
    amount,
    finalStatus: finalRow.data?.status ?? null,
    holdByPaymentOrderId: holdByOrder.ok,
    holdStatus: afterHold.data?.status ?? null,
    holdError: holdByOrder.ok ? null : holdByOrder.message,
    releaseByPaymentOrderId: releaseByOrder.ok,
    releaseStatus: afterRelease.data?.status ?? null,
    releaseError: releaseByOrder.ok ? null : releaseByOrder.message,
  };
  console.log(JSON.stringify(report, null, 2));
  if (
    !holdByOrder.ok ||
    afterHold.data?.status !== 'hold' ||
    !releaseByOrder.ok ||
    afterRelease.data?.status !== 'pending' ||
    finalRow.data?.status !== 'pending'
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '정산 보류 시드에 실패했습니다.');
  process.exitCode = 1;
});
