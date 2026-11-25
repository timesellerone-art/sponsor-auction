import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { settlementDueAtIso } from '../src/lib/business-days';
import { creatorPayoutAmount } from '../src/lib/fees';
import type { Database } from '../src/types/database';

const EMAIL = 'payout-biz-verify@clink.internal';
const NAME = '사업자세무검증 크리에이터';
const BUSINESS_NUMBER = '1208800001';
const TITLE = '[검증] 사업자 세무 테스트 캠페인';
const BID_AMOUNT = 100_000;
const PAYMENT_ORDER_ID = 'payout-biz-verify';

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
    if ((listed.data.users ?? []).length < 200) break;
  }
  if (!userId) {
    const created = await client.auth.admin.createUser({
      email: EMAIL,
      password: `payout-biz-${crypto.randomUUID()}`,
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
      business_registration_number: BUSINESS_NUMBER,
      business_verification_status: 'verified',
      business_status_detail: '검증 사업자 세무 테스트',
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
  const requestedAt = new Date().toISOString();
  const bankAccount = '신한은행 / 110-123-456789 / 사업자세무검증';
  const amount = creatorPayoutAmount(BID_AMOUNT);

  const existing = await client
    .from('payouts')
    .select('id, status, payment_order_id, amount, creator_email, auction_title')
    .eq('payment_order_id', PAYMENT_ORDER_ID)
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
      payment_order_id: PAYMENT_ORDER_ID,
      auction_id: null,
      bid_id: null,
      admin_memo: '검증 사업자 세무 테스트. 기존 운영 데이터와 무관합니다.',
      bank_account: bankAccount,
    };
    const withBank = {
      ...insertCore,
      bank_name: '신한은행',
      account_number: '110123456789',
      account_holder: NAME,
      settlement_due_at: settlementDueAtIso(requestedAt, 4),
    };
    let inserted = await client
      .from('payouts')
      .insert(withBank)
      .select('id, status, payment_order_id')
      .maybeSingle();
    if (inserted.error) {
      inserted = await client
        .from('payouts')
        .insert(insertCore)
        .select('id, status, payment_order_id')
        .maybeSingle();
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

  const finalRow = await client
    .from('payouts')
    .select(
      'id, status, payment_order_id, amount, creator_name, creator_email, auction_title, bank_account, bank_name, account_number',
    )
    .eq('id', payoutId)
    .maybeSingle();

  console.log(
    JSON.stringify(
      {
        payoutId,
        paymentOrderId: PAYMENT_ORDER_ID,
        creatorEmail: EMAIL,
        creatorName: NAME,
        auctionTitle: TITLE,
        bidAmount: BID_AMOUNT,
        amount,
        status: finalRow.data?.status ?? null,
        bank: finalRow.data?.bank_name ?? null,
        account: finalRow.data?.account_number ?? null,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '사업자 세무 테스트 시드에 실패했습니다.');
  process.exitCode = 1;
});
