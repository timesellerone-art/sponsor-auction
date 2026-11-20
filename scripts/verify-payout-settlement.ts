import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { settlementDueAtIso } from '../src/lib/business-days';
import { creatorPayoutAmount } from '../src/lib/fees';
import { upsertPaidPayout } from '../src/lib/payouts';
import type { Database } from '../src/types/database';

const EMAIL = 'payout-settlement-flow@clink.internal';
const NAME = '정산 계좌 검증';
const BID_AMOUNT = 100_000;

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
      password: `payout-settlement-${crypto.randomUUID()}`,
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

  const bidColumns = await client.from('bids').select('bank_name, account_number, account_holder').limit(1);
  const payoutColumns = await client
    .from('payouts')
    .select('bank_name, account_number, account_holder, settlement_due_at')
    .limit(1);
  const columnsReady = !bidColumns.error && !payoutColumns.error;
  if (!columnsReady) {
    throw new Error(
      `정산 컬럼이 없습니다. supabase/migrations/20261120_payout_settlement.sql 을 운영 SQL 편집기에서 실행해야 합니다. bids=${bidColumns.error?.message ?? 'ok'} payouts=${payoutColumns.error?.message ?? 'ok'}`,
    );
  }

  const userId = await ensureUser(client);
  const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const auction = await client
    .from('auctions')
    .insert({
      title: '정산 계좌 검증 캠페인',
      platform: 'other',
      budget: 500_000,
      description: '정산 계좌 저장 검증용 캠페인입니다.',
      status: 'active',
      author_id: userId,
      author_name: NAME,
      deadline,
    })
    .select('id')
    .single();
  if (auction.error || !auction.data) {
    throw new Error(auction.error?.message ?? '검증 캠페인을 만들지 못했습니다.');
  }

  const bid = await client
    .from('bids')
    .insert({
      auction_id: auction.data.id,
      creator_id: userId,
      creator_name: NAME,
      creator_channel_url: 'https://example.com/payout-settlement',
      bid_amount: BID_AMOUNT,
      proposal_text: '정산 계좌가 지급 대기까지 남는지 확인하는 제안입니다.',
      status: 'pending',
      bank_name: '신한은행',
      account_number: '110123456789',
      account_holder: '검증크리에이터',
    })
    .select('id, bank_name, account_number, account_holder')
    .single();
  if (bid.error || !bid.data) {
    await client.from('auctions').delete().eq('id', auction.data.id);
    throw new Error(bid.error?.message ?? '검증 제안을 만들지 못했습니다.');
  }

  const orderId = `payout-verify-${crypto.randomUUID()}`;
  try {
    await upsertPaidPayout(client, {
      orderId,
      auctionId: auction.data.id,
      bidId: bid.data.id,
      chargeAmount: 115_000,
      orderName: '정산 계좌 검증 캠페인',
    });
    await upsertPaidPayout(client, {
      orderId,
      auctionId: auction.data.id,
      bidId: bid.data.id,
      chargeAmount: 115_000,
      orderName: '정산 계좌 검증 캠페인',
    });

    const rows = await client
      .from('payouts')
      .select(
        'id, amount, status, bank_account, bank_name, account_number, account_holder, settlement_due_at, requested_at, payment_order_id',
      )
      .eq('payment_order_id', orderId);
    if (rows.error) {
      throw new Error(rows.error.message);
    }
    const list = rows.data ?? [];
    const row = list[0];
    const expectedAmount = creatorPayoutAmount(BID_AMOUNT);
    const expectedDue = row ? settlementDueAtIso(row.requested_at, 4) : null;
    const paid = await client
      .from('payouts')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('payment_order_id', orderId)
      .select('status')
      .maybeSingle();
    await upsertPaidPayout(client, {
      orderId,
      auctionId: auction.data.id,
      bidId: bid.data.id,
    });
    const afterPaid = await client
      .from('payouts')
      .select('status, bank_name, account_holder, amount')
      .eq('payment_order_id', orderId);

    const report = {
      bidStored: bid.data,
      payoutCount: list.length,
      amount: row?.amount ?? null,
      expectedAmount,
      bankAccount: row?.bank_account ?? null,
      bankName: row?.bank_name ?? null,
      accountNumber: row?.account_number ?? null,
      accountHolder: row?.account_holder ?? null,
      requestedAt: row?.requested_at ?? null,
      settlementDueAt: row?.settlement_due_at ?? null,
      expectedDue,
      markedPaid: paid.data?.status ?? paid.error?.message ?? null,
      statusAfterReplay: afterPaid.data?.[0]?.status ?? null,
      holderAfterReplay: afterPaid.data?.[0]?.account_holder ?? null,
      amountAfterReplay: afterPaid.data?.[0]?.amount ?? null,
      replayCount: afterPaid.data?.length ?? 0,
    };
    console.log(JSON.stringify(report, null, 2));

    const ok =
      list.length === 1 &&
      row?.amount === expectedAmount &&
      row.bank_name === '신한은행' &&
      row.account_number === '110123456789' &&
      row.account_holder === '검증크리에이터' &&
      row.bank_account === '신한은행 110123456789' &&
      row.settlement_due_at != null &&
      expectedDue != null &&
      new Date(row.settlement_due_at).getTime() === new Date(expectedDue).getTime() &&
      afterPaid.data?.length === 1 &&
      afterPaid.data[0]?.status === 'paid' &&
      afterPaid.data[0]?.account_holder === '검증크리에이터';
    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    await client.from('payouts').delete().eq('payment_order_id', orderId);
    await client.from('auctions').delete().eq('id', auction.data.id);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : '정산 검증에 실패했습니다.';
  console.error(message);
  process.exitCode = 1;
});
