import Module from 'node:module';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isOpenForBid } from '../src/lib/auction-browse';
import { campaignAwardOrderId, campaignHoldQuote } from '../src/lib/campaign-credit';
import { chargeUserCredit } from '../src/lib/credits';
import { describeSettlementAmounts } from '../src/lib/settlement-amounts';
import type { Database } from '../src/types/database';

const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function load(
  ...args: unknown[]
) {
  if (args[0] === 'server-only') {
    return {};
  }
  return originalLoad.call(this, ...args);
};

const ADV_EMAIL = 'award-sync-adv@clink.internal';
const CRE_EMAIL = 'award-sync-cre@clink.internal';
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
  for (const [key, value] of Object.entries(values)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  return values;
}

async function findUserId(client: Client, email: string) {
  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.auth.admin.listUsers({ page, perPage: 200 });
    const match = (listed.data.users ?? []).find(
      (user) => user.email?.trim().toLowerCase() === email,
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

async function ensureUser(
  client: Client,
  input: { email: string; name: string; role: 'advertiser' | 'creator' },
) {
  let userId = await findUserId(client, input.email);
  if (!userId) {
    const created = await client.auth.admin.createUser({
      email: input.email,
      password: `award-sync-${crypto.randomUUID()}`,
      email_confirm: true,
      user_metadata: { name: input.name, role: input.role, roles: [input.role] },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? `${input.role} 검증 계정을 만들지 못했습니다.`);
    }
    userId = created.data.user.id;
  }
  const profile = await client.from('profiles').upsert(
    {
      id: userId,
      name: input.name,
      email: input.email,
      role: input.role,
      roles: [input.role],
      status: 'active',
      ...(input.role === 'creator'
        ? {
            bank_name: '국민은행',
            account_number: '123456789012',
            account_holder: input.name,
            settlement_type: 'individual',
          }
        : {}),
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
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) {
    throw new Error('Supabase URL 또는 서비스 롤 키가 없습니다.');
  }
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const advertiserId = await ensureUser(client, {
    email: ADV_EMAIL,
    name: '낙찰동기화광고주',
    role: 'advertiser',
  });
  const creatorId = await ensureUser(client, {
    email: CRE_EMAIL,
    name: '낙찰동기화크리에이터',
    role: 'creator',
  });

  const charged = await chargeUserCredit(client, {
    userId: advertiserId,
    amount: 1_000_000,
    referenceId: `award-sync-charge:${crypto.randomUUID()}`,
    description: '낙찰 동기화 검증 충전',
  });
  if (!charged.ok) {
    throw new Error(charged.error.message);
  }

  const deadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
  const auction = await client
    .from('auctions')
    .insert({
      title: '낙찰 동기화 검증 캠페인',
      platform: 'other',
      budget: 500_000,
      description: '낙찰 시 원장·정산·오픈목록이 함께 갱신되는지 확인하는 캠페인입니다.',
      status: 'active',
      author_id: advertiserId,
      author_name: '낙찰동기화광고주',
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
      creator_id: creatorId,
      creator_name: '낙찰동기화크리에이터',
      creator_channel_url: 'https://example.com/award-sync',
      bid_amount: BID_AMOUNT,
      proposal_text: '낙찰 동기화 검증을 위한 제안 메시지입니다.',
      status: 'pending',
      bank_name: '국민은행',
      account_number: '123456789012',
      account_holder: '낙찰동기화크리에이터',
    })
    .select('id')
    .single();
  if (bid.error || !bid.data) {
    await client.from('auctions').delete().eq('id', auction.data.id);
    throw new Error(bid.error?.message ?? '검증 제안을 만들지 못했습니다.');
  }

  const quote = campaignHoldQuote(BID_AMOUNT);
  const settlement = describeSettlementAmounts(BID_AMOUNT, 'individual');
  const orderId = campaignAwardOrderId(auction.data.id, bid.data.id);
  const { awardCampaignWithCredit } = await import('../src/lib/campaign-award');
  const awarded = await awardCampaignWithCredit(client, {
    auctionId: auction.data.id,
    bidId: bid.data.id,
    actorUserId: advertiserId,
  });

  const [auctionRow, bids, payment, ledger, payouts] = await Promise.all([
    client
      .from('auctions')
      .select('id, status, winner_bid_id')
      .eq('id', auction.data.id)
      .maybeSingle(),
    client.from('bids').select('id, status, bid_amount').eq('auction_id', auction.data.id),
    client
      .from('payments')
      .select('order_id, auction_id, bid_id, amount, status')
      .eq('order_id', orderId)
      .maybeSingle(),
    client
      .from('credit_transactions')
      .select('type, amount, reference_id, description')
      .eq('reference_id', `campaign-pay:${orderId}`)
      .order('created_at', { ascending: false }),
    client
      .from('payouts')
      .select('id, amount, status, auction_id, bid_id, payment_order_id')
      .eq('auction_id', auction.data.id),
  ]);

  const winnerBid = (bids.data ?? []).find((row) => row.id === bid.data.id);
  const mappedWinnerId = auctionRow.data?.winner_bid_id ?? null;
  const open = isOpenForBid({
    status: (auctionRow.data?.status ?? 'active') as
      | 'active'
      | 'closed'
      | 'completed'
      | 'matched'
      | 'cancelled',
    isBlind: false,
    winnerBidId: mappedWinnerId,
  });
  const hold = (ledger.data ?? []).find((row) => row.type === 'HOLD');
  const payout = (payouts.data ?? [])[0];
  const checks = {
    awardOk: awarded.ok,
    auctionWinner: mappedWinnerId === bid.data.id,
    auctionClosed: auctionRow.data?.status === 'closed',
    bidSelected: winnerBid?.status === 'selected',
    paymentConfirmed: payment.data?.status === 'confirmed',
    paymentAmount: payment.data?.amount === quote.amount,
    holdAmount: hold?.amount === quote.amount,
    payoutAmount: payout?.amount === settlement.transferAmount,
    payoutPending: payout?.status === 'pending',
    hiddenFromOpen: open === false,
  };
  const failed = Object.entries(checks).filter(([, ok]) => !ok);

  console.log(
    JSON.stringify(
      {
        tables: {
          auctions: auctionRow.data,
          bids: bids.data,
          payments: payment.data,
          credit_transactions: ledger.data,
          payouts: payouts.data,
        },
        expected: {
          advertiserCharge: quote.amount,
          creatorTransfer: settlement.transferAmount,
        },
        award: awarded.ok
          ? { ok: true, status: awarded.data.status, winnerBidId: awarded.data.winnerBidId }
          : { ok: false, error: awarded.error, errorCode: awarded.errorCode },
        checks,
        failed: failed.map(([name]) => name),
      },
      null,
      2,
    ),
  );

  await client.from('payouts').delete().eq('auction_id', auction.data.id);
  await client.from('payments').delete().eq('order_id', orderId);
  await client.from('auctions').delete().eq('id', auction.data.id);

  if (failed.length > 0 || !awarded.ok) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
