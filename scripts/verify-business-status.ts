import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  businessActionBlock,
  isValidBusinessRegistrationNumber,
  profileStatusFromNts,
} from '../src/lib/business-registration';
import {
  chargeUserCredit,
  deductUserCredit,
  getCreditBalance,
  restoreUserCredit,
} from '../src/lib/credits';
import type { Database } from '../src/types/database';

const EMAIL = 'business-status-flow@clink.internal';
const NAME = '사업자 상태 검증';

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

function sampleNumber() {
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const first = '120880000';
  const numbers = first.split('').map((item) => Number(item));
  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += numbers[index] * weights[index];
  }
  sum += Math.floor((numbers[8] * 5) / 10);
  return `${first}${(10 - (sum % 10)) % 10}`;
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
      password: `business-status-${crypto.randomUUID()}`,
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
  const url = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('Supabase URL 또는 서비스 롤 키가 없습니다.');
  }
  const client = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const userId = await ensureUser(client);
  const before = await getCreditBalance(client, userId);
  const grant = await chargeUserCredit(client, {
    userId,
    amount: 1_000,
    referenceId: `admin-grant:${crypto.randomUUID()}`,
    description: '사업자 검증 지급',
  });
  const afterGrant = await getCreditBalance(client, userId);
  const refund = grant.ok
    ? await restoreUserCredit(client, {
        userId,
        amount: 1_000,
        type: 'REFUND',
        referenceId: `admin-refund:${crypto.randomUUID()}`,
        description: '사업자 검증 환불',
      })
    : null;
  const afterRefund = await getCreditBalance(client, userId);
  const leftover = Math.max(0, (afterRefund ?? 0) - 0);
  const swept =
    leftover > 0
      ? await deductUserCredit(client, {
          userId,
          amount: leftover,
          type: 'HOLD',
          referenceId: `admin-deduct:${crypto.randomUUID()}`,
          description: '사업자 검증 잔액 원복',
        })
      : { ok: true as const };
  const finalBalance = await getCreditBalance(client, userId);

  const probe = await client
    .from('profiles')
    .select('business_registration_number, business_verification_status')
    .eq('id', userId)
    .maybeSingle();
  const number = sampleNumber();
  let savedStatus: string | null = null;
  let approvedStatus: string | null = null;
  let cleared = false;
  if (!probe.error) {
    const saved = await client
      .from('profiles')
      .update({
        business_registration_number: number,
        business_verification_status: profileStatusFromNts('01', '계속사업자').status,
        business_status_detail: '검증용 계속사업자',
        business_checked_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('business_verification_status')
      .maybeSingle();
    savedStatus = saved.data?.business_verification_status ?? saved.error?.message ?? null;
    const approved = await client
      .from('profiles')
      .update({ business_verification_status: 'verified', business_status_detail: '검증 승인' })
      .eq('id', userId)
      .select('business_verification_status, business_registration_number')
      .maybeSingle();
    approvedStatus = approved.data?.business_verification_status ?? null;
    const reset = await client
      .from('profiles')
      .update({
        business_registration_number: '',
        business_verification_status: 'unregistered',
        business_status_detail: '',
        business_review_note: '',
        business_checked_at: null,
      })
      .eq('id', userId)
      .select('business_verification_status, business_registration_number')
      .maybeSingle();
    cleared =
      reset.data?.business_verification_status === 'unregistered' &&
      (reset.data.business_registration_number ?? '') === '';
  }

  const report = {
    numberValid: isValidBusinessRegistrationNumber(number),
    closedBlocksCharge: Boolean(businessActionBlock('closed', 'charge')),
    verifiedAllowsCampaign: businessActionBlock('verified', 'campaign') === null,
    balanceBefore: before,
    grantOk: grant.ok,
    balanceAfterGrant: afterGrant,
    refundOk: refund?.ok ?? false,
    balanceAfterRefund: afterRefund,
    sweptOk: swept.ok,
    finalBalance,
    columnsReady: !probe.error,
    columnError: probe.error?.message ?? null,
    savedStatus,
    approvedStatus,
    cleared,
    lookupConfigured: Boolean(env.NTS_BUSINESS_API_KEY || env.DATA_GO_KR_SERVICE_KEY),
  };
  console.log(JSON.stringify(report, null, 2));
  const ok =
    report.numberValid &&
    report.closedBlocksCharge &&
    report.verifiedAllowsCampaign &&
    grant.ok &&
    refund?.ok &&
    swept.ok &&
    afterGrant === (before ?? 0) + 1_000 &&
    afterRefund === (before ?? 0) + 2_000 &&
    finalBalance === 0 &&
    report.columnsReady &&
    savedStatus === 'review_required' &&
    approvedStatus === 'verified' &&
    cleared;
  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : '사업자 상태 검증에 실패했습니다.');
  process.exitCode = 1;
});
