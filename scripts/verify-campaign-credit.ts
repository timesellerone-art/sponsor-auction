import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  campaignPayReference,
  holdCampaignCredit,
  releaseAuctionCampaignCredits,
  releaseCampaignCredit,
  timeslotAwardReference,
} from '../src/lib/campaign-credit';
import {
  chargeUserCredit,
  getCreditBalance,
  resetCreditLedger,
  snapshotOtherProfileCredits,
  type CreditLedgerClient,
} from '../src/lib/credits';
import type { Database } from '../src/types/database';

const EMAIL = 'campaign-credit-flow@clink.internal';
const NAME = '캠페인 크레딧 검증';

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

async function ensureUser(client: CreditLedgerClient) {
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
      password: `campaign-credit-${crypto.randomUUID()}`,
      email_confirm: true,
      user_metadata: { name: NAME, role: 'advertiser', roles: ['advertiser'] },
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

async function main() {
  const env = loadEnv();
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = (
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_KEY ||
    env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  if (!url || !key) {
    throw new Error('SUPABASE_URL 또는 SERVICE_ROLE_KEY가 없습니다.');
  }

  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = await ensureUser(client);
  const othersBefore = await snapshotOtherProfileCredits(client, userId);
  await resetCreditLedger(client, userId);

  const stamp = Date.now().toString(36);
  const orderId = `ccv${stamp}`.slice(0, 24);
  const orderId2 = `ccw${stamp}`.slice(0, 24);
  const auctionId = crypto.randomUUID();
  const reference = campaignPayReference(orderId);
  const steps: Record<string, unknown> = {};

  const charged = await chargeUserCredit(client, {
    userId,
    amount: 200_000,
    referenceId: `campaign-credit-charge-${stamp}`,
    description: '캠페인 차감 검증 충전',
  });
  const afterCharge = await getCreditBalance(client, userId);
  steps.charge = { ok: charged.ok, balance: afterCharge };

  const held = await holdCampaignCredit(client, {
    userId,
    referenceId: reference,
    bidAmount: 100_000,
    title: '검증 캠페인',
  });
  const afterHold = await getCreditBalance(client, userId);
  steps.hold = { ok: held.ok, amount: held.ok ? held.amount : null, balance: afterHold };

  const heldAgain = await holdCampaignCredit(client, {
    userId,
    referenceId: reference,
    bidAmount: 100_000,
    title: '검증 캠페인',
  });
  const afterHoldAgain = await getCreditBalance(client, userId);
  steps.holdAgain = {
    ok: heldAgain.ok,
    alreadyHeld: heldAgain.ok ? heldAgain.alreadyHeld : false,
    balance: afterHoldAgain,
  };

  const overdraft = await holdCampaignCredit(client, {
    userId,
    referenceId: campaignPayReference(`${orderId}-over`),
    bidAmount: 200_000,
    title: '잔액 부족',
  });
  const afterOverdraft = await getCreditBalance(client, userId);
  steps.overdraft = {
    ok: overdraft.ok,
    code: overdraft.ok ? null : overdraft.code,
    balance: afterOverdraft,
  };

  const released = await releaseCampaignCredit(client, {
    referenceId: reference,
    reason: '검증 채택 실패',
  });
  const afterRelease = await getCreditBalance(client, userId);
  steps.release = { ok: released.ok, restored: released.ok ? released.restored : false, balance: afterRelease };

  const releasedAgain = await releaseCampaignCredit(client, {
    referenceId: reference,
    reason: '검증 중복 복구',
  });
  const afterReleaseAgain = await getCreditBalance(client, userId);
  steps.releaseAgain = {
    ok: releasedAgain.ok,
    restored: releasedAgain.ok ? releasedAgain.restored : false,
    balance: afterReleaseAgain,
  };

  const retryRef = campaignPayReference(orderId2);
  const retried = await holdCampaignCredit(client, {
    userId,
    referenceId: retryRef,
    bidAmount: 100_000,
    title: '검증 재시도',
  });
  const payment = await client.from('payments').insert({
    order_id: orderId2,
    auction_id: auctionId,
    bid_id: crypto.randomUUID(),
    amount: 115_000,
    order_name: '캠페인 크레딧 검증',
    status: 'pending',
  });
  const cancelled = await releaseAuctionCampaignCredits(client, auctionId, '검증 캠페인 취소');
  const afterCancel = await getCreditBalance(client, userId);
  await client.from('payments').delete().eq('order_id', orderId2);
  steps.cancel = {
    retry: retried.ok,
    paymentError: payment.error?.message ?? null,
    restoredCount: cancelled.ok ? cancelled.restoredCount : 0,
    restoredAmount: cancelled.ok ? cancelled.restoredAmount : 0,
    balance: afterCancel,
  };

  const slotRef = timeslotAwardReference(crypto.randomUUID(), crypto.randomUUID(), stamp);
  const slotHeld = await holdCampaignCredit(client, {
    userId,
    referenceId: slotRef,
    bidAmount: 10_000,
    title: '타임슬롯 검증',
  });
  const slotBalance = await getCreditBalance(client, userId);
  const slotReleased = await releaseCampaignCredit(client, {
    referenceId: slotRef,
    reason: '타임슬롯 채택 실패',
  });
  const slotAfter = await getCreditBalance(client, userId);
  steps.timeslot = {
    held: slotHeld.ok ? slotHeld.amount : null,
    balance: slotBalance,
    restored: slotReleased.ok ? slotReleased.restored : false,
    balanceAfter: slotAfter,
  };

  await resetCreditLedger(client, userId);
  const finalBalance = await getCreditBalance(client, userId);
  const othersAfter = await snapshotOtherProfileCredits(client, userId);
  const othersSame =
    othersBefore.length === othersAfter.length &&
    othersBefore.every((row, index) => {
      const next = othersAfter[index];
      return (
        next &&
        row.id === next.id &&
        row.email === next.email &&
        row.credit_balance === next.credit_balance
      );
    });

  const passed =
    charged.ok &&
    afterCharge === 200_000 &&
    held.ok &&
    held.amount === 115_000 &&
    afterHold === 85_000 &&
    heldAgain.ok &&
    heldAgain.alreadyHeld &&
    afterHoldAgain === 85_000 &&
    !overdraft.ok &&
    overdraft.code === 'INSUFFICIENT_CREDIT' &&
    afterOverdraft === 85_000 &&
    released.ok &&
    released.restored &&
    afterRelease === 200_000 &&
    releasedAgain.ok &&
    !releasedAgain.restored &&
    afterReleaseAgain === 200_000 &&
    retried.ok &&
    cancelled.ok &&
    cancelled.restoredCount === 1 &&
    cancelled.restoredAmount === 115_000 &&
    afterCancel === 200_000 &&
    slotHeld.ok &&
    slotHeld.amount === 11_500 &&
    slotBalance === 188_500 &&
    slotReleased.ok &&
    slotReleased.restored &&
    slotAfter === 200_000 &&
    finalBalance === 0 &&
    othersSame &&
    !payment.error;

  console.log(
    JSON.stringify(
      {
        passed,
        userId,
        finalBalance,
        othersSame,
        otherProfiles: othersBefore.length,
        steps,
      },
      null,
      2,
    ),
  );
  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
