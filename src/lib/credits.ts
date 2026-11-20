import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

export type CreditTransactionType = Database['public']['Tables']['credit_transactions']['Row']['type'];

export type CreditLedgerClient = SupabaseClient<Database>;

export const CREDIT_LEDGER_TEST_EMAIL = 'credit-ledger-verify@clink.internal';
export const CREDIT_LEDGER_TEST_NAME = '크레딧 원장 검증';

export type CreditRpcResult = {
  balance_after: number;
  transaction_id: string;
  type: CreditTransactionType;
};

export type CreditRpcFailure = {
  code:
    | 'INSUFFICIENT_CREDIT'
    | 'INVALID_AMOUNT'
    | 'PROFILE_NOT_FOUND'
    | 'INVALID_TYPE'
    | 'DUPLICATE_REFERENCE'
    | 'RPC_ERROR';
  message: string;
};

export type CreditMutationResult =
  | { ok: true; data: CreditRpcResult }
  | { ok: false; error: CreditRpcFailure };

export type CreditScenarioResult = {
  id: '1' | '2' | '3' | '4';
  title: string;
  passed: boolean;
  detail: Record<string, unknown>;
};

export const DEMO_PROTECTED_EMAILS = ['admin@demo.com', 'brand@demo.com', 'creator@demo.com'] as const;

export type ProfileCreditSnapshot = {
  id: string;
  email: string | null;
  credit_balance: number;
};

export type InventoryFingerprint = {
  auctionCount: number;
  bidCount: number;
  timeSlotBidCount: number;
  checksum: string;
};

export type HardeningScenarioId =
  | 'idempotency'
  | 'race'
  | 'release_refund'
  | 'invalid'
  | 'isolation';

export type HardeningScenarioResult = {
  id: HardeningScenarioId;
  title: string;
  passed: boolean;
  detail: Record<string, unknown>;
};

export type CreditLedgerRow = {
  id: string;
  type: CreditTransactionType;
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

function asRpcResult(value: unknown): CreditRpcResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Record<string, unknown>;
  const balance = typeof row.balance_after === 'number' ? row.balance_after : Number(row.balance_after);
  const transactionId = typeof row.transaction_id === 'string' ? row.transaction_id : '';
  const type = row.type;
  if (!Number.isInteger(balance) || !transactionId) {
    return null;
  }
  if (type !== 'CHARGE' && type !== 'HOLD' && type !== 'RELEASE' && type !== 'REFUND') {
    return null;
  }
  return {
    balance_after: balance,
    transaction_id: transactionId,
    type,
  };
}

export function classifyCreditRpcError(message: string): CreditRpcFailure {
  const text = message.trim();
  if (text.includes('insufficient_credit')) {
    return { code: 'INSUFFICIENT_CREDIT', message: '잔액이 부족합니다.' };
  }
  if (text.includes('invalid_credit_amount')) {
    return { code: 'INVALID_AMOUNT', message: '크레딧 금액이 올바르지 않습니다.' };
  }
  if (text.includes('profile_not_found')) {
    return { code: 'PROFILE_NOT_FOUND', message: '프로필을 찾을 수 없습니다.' };
  }
  if (text.includes('invalid_credit_type')) {
    return { code: 'INVALID_TYPE', message: '크레딧 거래 유형이 올바르지 않습니다.' };
  }
  if (
    text.includes('duplicate_credit_reference') ||
    text.includes('credit_transactions_user_type_ref') ||
    text.includes('duplicate key value')
  ) {
    return { code: 'DUPLICATE_REFERENCE', message: '이미 처리된 크레딧 요청입니다.' };
  }
  return { code: 'RPC_ERROR', message: text || '크레딧 처리에 실패했습니다.' };
}

export async function getCreditBalance(client: CreditLedgerClient, userId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('credit_balance')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data?.credit_balance ?? null;
}

export async function listCreditTransactions(client: CreditLedgerClient, userId: string) {
  const { data, error } = await client
    .from('credit_transactions')
    .select('id, user_id, type, amount, balance_after, reference_id, description, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return data ?? [];
}

export function summarizeCreditTransactions(
  rows: Awaited<ReturnType<typeof listCreditTransactions>>,
): CreditLedgerRow[] {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    amount: row.amount,
    balance_after: row.balance_after,
    reference_id: row.reference_id,
    description: row.description,
    created_at: row.created_at,
  }));
}

function inventoryChecksum(ids: string[]) {
  const sorted = [...ids].sort();
  let hash = 0;
  for (const id of sorted) {
    for (let index = 0; index < id.length; index += 1) {
      hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
    }
  }
  return `${sorted.length}:${hash.toString(16)}:${sorted[0] ?? ''}:${sorted[sorted.length - 1] ?? ''}`;
}

export async function snapshotOtherProfileCredits(client: CreditLedgerClient, testUserId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('id, email, credit_balance')
    .neq('id', testUserId)
    .order('email', { ascending: true });
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as ProfileCreditSnapshot[];
}

export async function snapshotCampaignInventory(client: CreditLedgerClient): Promise<InventoryFingerprint> {
  const [auctions, bids, timeSlotBids] = await Promise.all([
    client.from('auctions').select('id'),
    client.from('bids').select('id'),
    client.from('time_slot_bids').select('id'),
  ]);
  if (auctions.error) {
    throw new Error(auctions.error.message);
  }
  if (bids.error) {
    throw new Error(bids.error.message);
  }
  if (timeSlotBids.error) {
    throw new Error(timeSlotBids.error.message);
  }
  const auctionIds = (auctions.data ?? []).map((row) => row.id);
  const bidIds = (bids.data ?? []).map((row) => row.id);
  const timeSlotBidIds = (timeSlotBids.data ?? []).map((row) => row.id);
  return {
    auctionCount: auctionIds.length,
    bidCount: bidIds.length,
    timeSlotBidCount: timeSlotBidIds.length,
    checksum: [
      inventoryChecksum(auctionIds),
      inventoryChecksum(bidIds),
      inventoryChecksum(timeSlotBidIds),
    ].join('|'),
  };
}

function sameProfileSnapshots(left: ProfileCreditSnapshot[], right: ProfileCreditSnapshot[]) {
  if (left.length !== right.length) {
    return false;
  }
  const keyOf = (row: ProfileCreditSnapshot) => `${row.id}|${row.email ?? ''}|${row.credit_balance}`;
  const a = left.map(keyOf).sort();
  const b = right.map(keyOf).sort();
  return a.every((value, index) => value === b[index]);
}

export async function chargeUserCredit(
  client: CreditLedgerClient,
  input: {
    userId: string;
    amount: number;
    referenceId?: string | null;
    description?: string | null;
  },
): Promise<CreditMutationResult> {
  const { data, error } = await client.rpc('charge_user_credit', {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_reference_id: input.referenceId ?? null,
    p_description: input.description ?? null,
  });
  if (error) {
    return { ok: false, error: classifyCreditRpcError(error.message) };
  }
  const parsed = asRpcResult(data);
  if (!parsed) {
    return { ok: false, error: { code: 'RPC_ERROR', message: '충전 응답을 해석하지 못했습니다.' } };
  }
  return { ok: true, data: parsed };
}

export async function deductUserCredit(
  client: CreditLedgerClient,
  input: {
    userId: string;
    amount: number;
    type?: 'HOLD';
    referenceId?: string | null;
    description?: string | null;
  },
): Promise<CreditMutationResult> {
  const { data, error } = await client.rpc('deduct_user_credit', {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_type: input.type ?? 'HOLD',
    p_reference_id: input.referenceId ?? null,
    p_description: input.description ?? null,
  });
  if (error) {
    return { ok: false, error: classifyCreditRpcError(error.message) };
  }
  const parsed = asRpcResult(data);
  if (!parsed) {
    return { ok: false, error: { code: 'RPC_ERROR', message: '차감 응답을 해석하지 못했습니다.' } };
  }
  return { ok: true, data: parsed };
}

export async function restoreUserCredit(
  client: CreditLedgerClient,
  input: {
    userId: string;
    amount: number;
    type: 'RELEASE' | 'REFUND';
    referenceId?: string | null;
    description?: string | null;
  },
): Promise<CreditMutationResult> {
  const { data, error } = await client.rpc('restore_user_credit', {
    p_user_id: input.userId,
    p_amount: input.amount,
    p_type: input.type,
    p_reference_id: input.referenceId ?? null,
    p_description: input.description ?? null,
  });
  if (error) {
    return { ok: false, error: classifyCreditRpcError(error.message) };
  }
  const parsed = asRpcResult(data);
  if (!parsed) {
    return { ok: false, error: { code: 'RPC_ERROR', message: '복원 응답을 해석하지 못했습니다.' } };
  }
  return { ok: true, data: parsed };
}

export async function ensureCreditLedgerTestUser(client: CreditLedgerClient) {
  const email = CREDIT_LEDGER_TEST_EMAIL;
  let userId: string | null = null;

  for (let page = 1; page <= 20; page += 1) {
    const listed = await client.auth.admin.listUsers({ page, perPage: 200 });
    const match = (listed.data.users ?? []).find(
      (user) => user.email?.trim().toLowerCase() === email,
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
      email,
      password: `credit-ledger-${crypto.randomUUID()}`,
      email_confirm: true,
      user_metadata: {
        name: CREDIT_LEDGER_TEST_NAME,
        role: 'advertiser',
        roles: ['advertiser'],
        credit_ledger_test: true,
      },
    });
    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? '크레딧 검증 계정을 만들지 못했습니다.');
    }
    userId = created.data.user.id;
  }

  const profile = await client.from('profiles').upsert(
    {
      id: userId,
      name: CREDIT_LEDGER_TEST_NAME,
      email,
      role: 'advertiser',
      roles: ['advertiser'],
      status: 'active',
    },
    { onConflict: 'id' },
  );
  if (profile.error) {
    throw new Error(profile.error.message);
  }

  return { id: userId, email };
}

export async function resetCreditLedger(client: CreditLedgerClient, userId: string) {
  const deleted = await client.from('credit_transactions').delete().eq('user_id', userId);
  if (deleted.error) {
    throw new Error(deleted.error.message);
  }
  const updated = await client.from('profiles').update({ credit_balance: 0 }).eq('id', userId);
  if (updated.error) {
    throw new Error(updated.error.message);
  }
}

export async function runCreditLedgerScenarios(
  client: CreditLedgerClient,
  userId: string,
): Promise<CreditScenarioResult[]> {
  const stamp = Date.now().toString(36);
  const results: CreditScenarioResult[] = [];

  const initialBalance = await getCreditBalance(client, userId);
  const initialLogs = await listCreditTransactions(client, userId);
  results.push({
    id: '1',
    title: '초기 잔액 0원',
    passed: initialBalance === 0 && initialLogs.length === 0,
    detail: { balance: initialBalance, transactionCount: initialLogs.length },
  });

  const charged = await chargeUserCredit(client, {
    userId,
    amount: 100_000,
    referenceId: `credit-test-charge-${stamp}`,
    description: '검증 시나리오 충전 100,000',
  });
  const afterCharge = await getCreditBalance(client, userId);
  const chargeLogs = (await listCreditTransactions(client, userId)).filter((row) => row.type === 'CHARGE');
  results.push({
    id: '2',
    title: '100,000 충전 후 잔액·CHARGE 로그',
    passed:
      charged.ok &&
      afterCharge === 100_000 &&
      chargeLogs.length === 1 &&
      chargeLogs[0]?.amount === 100_000 &&
      chargeLogs[0]?.balance_after === 100_000,
    detail: { rpc: charged, balance: afterCharge, chargeLogs },
  });

  const overdraft = await deductUserCredit(client, {
    userId,
    amount: 150_000,
    type: 'HOLD',
    referenceId: `credit-test-overdraft-${stamp}`,
    description: '검증 시나리오 잔액 부족 차감',
  });
  const afterOverdraft = await getCreditBalance(client, userId);
  const logsAfterOverdraft = await listCreditTransactions(client, userId);
  results.push({
    id: '3',
    title: '150,000 차감 시 잔액 부족 에러 및 100,000 유지',
    passed:
      !overdraft.ok &&
      overdraft.error.code === 'INSUFFICIENT_CREDIT' &&
      afterOverdraft === 100_000 &&
      logsAfterOverdraft.length === 1,
    detail: { rpc: overdraft, balance: afterOverdraft, transactionCount: logsAfterOverdraft.length },
  });

  const held = await deductUserCredit(client, {
    userId,
    amount: 60_000,
    type: 'HOLD',
    referenceId: `credit-test-hold-${stamp}`,
    description: '검증 시나리오 HOLD 60,000',
  });
  const afterHold = await getCreditBalance(client, userId);
  const holdLogs = (await listCreditTransactions(client, userId)).filter((row) => row.type === 'HOLD');
  results.push({
    id: '4',
    title: '60,000 HOLD 후 잔액 40,000·HOLD 로그',
    passed:
      held.ok &&
      afterHold === 40_000 &&
      holdLogs.length === 1 &&
      holdLogs[0]?.amount === 60_000 &&
      holdLogs[0]?.balance_after === 40_000,
    detail: { rpc: held, balance: afterHold, holdLogs },
  });

  return results;
}

function mutationSummary(result: CreditMutationResult) {
  if (result.ok) {
    return {
      ok: true as const,
      balance_after: result.data.balance_after,
      transaction_id: result.data.transaction_id,
      type: result.data.type,
    };
  }
  return {
    ok: false as const,
    code: result.error.code,
    message: result.error.message,
  };
}

export async function runCreditLedgerHardeningScenarios(
  client: CreditLedgerClient,
  userId: string,
): Promise<HardeningScenarioResult[]> {
  const stamp = Date.now().toString(36);
  const chargeRef = `hardening-idem-charge-${stamp}`;
  const holdRef = `hardening-idem-hold-${stamp}`;
  const raceRefA = `hardening-race-a-${stamp}`;
  const raceRefB = `hardening-race-b-${stamp}`;
  const refundHoldRef = `hardening-refund-hold-${stamp}`;
  const refundRef = `hardening-refund-${stamp}`;
  const overdraftRef = `hardening-overdraft-${stamp}`;
  const results: HardeningScenarioResult[] = [];

  const othersBefore = await snapshotOtherProfileCredits(client, userId);
  const inventoryBefore = await snapshotCampaignInventory(client);

  const chargeFirst = await chargeUserCredit(client, {
    userId,
    amount: 50_000,
    referenceId: chargeRef,
    description: '고강도 검증 멱등 충전 1회차',
  });
  const afterChargeFirst = {
    balance: await getCreditBalance(client, userId),
    transactionCount: (await listCreditTransactions(client, userId)).length,
  };
  const chargeSecond = await chargeUserCredit(client, {
    userId,
    amount: 50_000,
    referenceId: chargeRef,
    description: '고강도 검증 멱등 충전 2회차',
  });
  const afterChargeSecond = {
    balance: await getCreditBalance(client, userId),
    transactionCount: (await listCreditTransactions(client, userId)).length,
  };

  const holdFirst = await deductUserCredit(client, {
    userId,
    amount: 10_000,
    type: 'HOLD',
    referenceId: holdRef,
    description: '고강도 검증 멱등 HOLD 1회차',
  });
  const afterHoldFirst = {
    balance: await getCreditBalance(client, userId),
    transactionCount: (await listCreditTransactions(client, userId)).length,
  };
  const holdSecond = await deductUserCredit(client, {
    userId,
    amount: 10_000,
    type: 'HOLD',
    referenceId: holdRef,
    description: '고강도 검증 멱등 HOLD 2회차',
  });
  const afterHoldSecond = {
    balance: await getCreditBalance(client, userId),
    transactionCount: (await listCreditTransactions(client, userId)).length,
  };

  results.push({
    id: 'idempotency',
    title: '동일 reference_id 충전·HOLD 2회 요청 시 중복 반영 차단',
    passed:
      chargeFirst.ok &&
      chargeFirst.data.balance_after === 50_000 &&
      afterChargeFirst.balance === 50_000 &&
      afterChargeFirst.transactionCount === 1 &&
      !chargeSecond.ok &&
      chargeSecond.error.code === 'DUPLICATE_REFERENCE' &&
      afterChargeSecond.balance === 50_000 &&
      afterChargeSecond.transactionCount === 1 &&
      holdFirst.ok &&
      holdFirst.data.balance_after === 40_000 &&
      afterHoldFirst.balance === 40_000 &&
      afterHoldFirst.transactionCount === 2 &&
      !holdSecond.ok &&
      holdSecond.error.code === 'DUPLICATE_REFERENCE' &&
      afterHoldSecond.balance === 40_000 &&
      afterHoldSecond.transactionCount === 2,
    detail: {
      charge: {
        referenceId: chargeRef,
        first: { response: mutationSummary(chargeFirst), ...afterChargeFirst },
        second: { response: mutationSummary(chargeSecond), ...afterChargeSecond },
      },
      hold: {
        referenceId: holdRef,
        first: { response: mutationSummary(holdFirst), ...afterHoldFirst },
        second: { response: mutationSummary(holdSecond), ...afterHoldSecond },
      },
    },
  });

  const balanceBeforeRace = await getCreditBalance(client, userId);
  const [raceOne, raceTwo] = await Promise.all([
    deductUserCredit(client, {
      userId,
      amount: 30_000,
      type: 'HOLD',
      referenceId: raceRefA,
      description: '고강도 검증 동시 HOLD A',
    }),
    deductUserCredit(client, {
      userId,
      amount: 30_000,
      type: 'HOLD',
      referenceId: raceRefB,
      description: '고강도 검증 동시 HOLD B',
    }),
  ]);
  const afterRace = {
    balance: await getCreditBalance(client, userId),
    transactions: summarizeCreditTransactions(await listCreditTransactions(client, userId)),
  };
  const raceOutcomes = [raceOne, raceTwo];
  const raceWins = raceOutcomes.filter((item) => item.ok);
  const raceFails = raceOutcomes.filter((item) => !item.ok);
  const winningRef = raceOne.ok ? raceRefA : raceTwo.ok ? raceRefB : null;

  results.push({
    id: 'race',
    title: '잔액 40,000에서 30,000 동시 차감 1성공·1잔액부족, 최종 10,000',
    passed:
      balanceBeforeRace === 40_000 &&
      raceWins.length === 1 &&
      raceFails.length === 1 &&
      raceFails[0]?.error.code === 'INSUFFICIENT_CREDIT' &&
      afterRace.balance === 10_000 &&
      Boolean(winningRef),
    detail: {
      balanceBeforeRace,
      requests: [
        { referenceId: raceRefA, response: mutationSummary(raceOne) },
        { referenceId: raceRefB, response: mutationSummary(raceTwo) },
      ],
      winningRef,
      balanceAfterRace: afterRace.balance,
      transactionCount: afterRace.transactions.length,
    },
  });

  const released = await restoreUserCredit(client, {
    userId,
    amount: 30_000,
    type: 'RELEASE',
    referenceId: winningRef,
    description: '고강도 검증 HOLD 해제',
  });
  const afterRelease = {
    balance: await getCreditBalance(client, userId),
    transactions: summarizeCreditTransactions(await listCreditTransactions(client, userId)),
  };
  const refundHold = await deductUserCredit(client, {
    userId,
    amount: 8_000,
    type: 'HOLD',
    referenceId: refundHoldRef,
    description: '고강도 검증 환불용 HOLD',
  });
  const afterRefundHold = {
    balance: await getCreditBalance(client, userId),
    transactions: summarizeCreditTransactions(await listCreditTransactions(client, userId)),
  };
  const refunded = await restoreUserCredit(client, {
    userId,
    amount: 8_000,
    type: 'REFUND',
    referenceId: refundRef,
    description: '고강도 검증 환불',
  });
  const afterRefund = {
    balance: await getCreditBalance(client, userId),
    transactions: summarizeCreditTransactions(await listCreditTransactions(client, userId)),
  };
  const releaseRow = afterRelease.transactions.find((row) => row.type === 'RELEASE' && row.reference_id === winningRef);
  const refundHoldRow = afterRefundHold.transactions.find(
    (row) => row.type === 'HOLD' && row.reference_id === refundHoldRef,
  );
  const refundRow = afterRefund.transactions.find((row) => row.type === 'REFUND' && row.reference_id === refundRef);

  results.push({
    id: 'release_refund',
    title: 'HOLD 해제(RELEASE)와 환불(REFUND) 원장 기록',
    passed:
      Boolean(winningRef) &&
      released.ok &&
      released.data.type === 'RELEASE' &&
      released.data.balance_after === 40_000 &&
      afterRelease.balance === 40_000 &&
      releaseRow?.amount === 30_000 &&
      releaseRow.balance_after === 40_000 &&
      releaseRow.reference_id === winningRef &&
      refundHold.ok &&
      afterRefundHold.balance === 32_000 &&
      refundHoldRow?.amount === 8_000 &&
      refundHoldRow.balance_after === 32_000 &&
      refunded.ok &&
      refunded.data.type === 'REFUND' &&
      refunded.data.balance_after === 40_000 &&
      afterRefund.balance === 40_000 &&
      refundRow?.amount === 8_000 &&
      refundRow.balance_after === 40_000 &&
      refundRow.reference_id === refundRef,
    detail: {
      steps: [
        {
          flow: 'RELEASE',
          response: mutationSummary(released),
          ledger: releaseRow ?? null,
          balance: afterRelease.balance,
        },
        {
          flow: 'HOLD(환불 대상)',
          response: mutationSummary(refundHold),
          ledger: refundHoldRow ?? null,
          balance: afterRefundHold.balance,
        },
        {
          flow: 'REFUND',
          response: mutationSummary(refunded),
          ledger: refundRow ?? null,
          balance: afterRefund.balance,
        },
      ],
    },
  });

  const txCountBeforeInvalid = (await listCreditTransactions(client, userId)).length;
  const balanceBeforeInvalid = await getCreditBalance(client, userId);
  const zeroCharge = await chargeUserCredit(client, {
    userId,
    amount: 0,
    referenceId: `hardening-zero-${stamp}`,
    description: '고강도 검증 금액 0',
  });
  const negativeHold = await deductUserCredit(client, {
    userId,
    amount: -1,
    type: 'HOLD',
    referenceId: `hardening-negative-${stamp}`,
    description: '고강도 검증 음수',
  });
  const overdraft = await deductUserCredit(client, {
    userId,
    amount: 999_999,
    type: 'HOLD',
    referenceId: overdraftRef,
    description: '고강도 검증 잔액 초과',
  });
  const invalidType = await restoreUserCredit(client, {
    userId,
    amount: 1_000,
    type: 'HOLD' as 'RELEASE',
    referenceId: `hardening-invalid-type-${stamp}`,
    description: '고강도 검증 잘못된 복원 유형',
  });
  const afterInvalid = {
    balance: await getCreditBalance(client, userId),
    transactionCount: (await listCreditTransactions(client, userId)).length,
  };

  results.push({
    id: 'invalid',
    title: '금액 0·음수·잔액 초과 시 에러와 잔액 불변',
    passed:
      balanceBeforeInvalid === 40_000 &&
      !zeroCharge.ok &&
      zeroCharge.error.code === 'INVALID_AMOUNT' &&
      !negativeHold.ok &&
      negativeHold.error.code === 'INVALID_AMOUNT' &&
      !overdraft.ok &&
      overdraft.error.code === 'INSUFFICIENT_CREDIT' &&
      !invalidType.ok &&
      invalidType.error.code === 'INVALID_TYPE' &&
      afterInvalid.balance === 40_000 &&
      afterInvalid.transactionCount === txCountBeforeInvalid,
    detail: {
      balanceBefore: balanceBeforeInvalid,
      zero: mutationSummary(zeroCharge),
      negative: mutationSummary(negativeHold),
      overdraft: mutationSummary(overdraft),
      invalidType: mutationSummary(invalidType),
      balanceAfter: afterInvalid.balance,
      transactionCountBefore: txCountBeforeInvalid,
      transactionCountAfter: afterInvalid.transactionCount,
    },
  });

  const othersAfter = await snapshotOtherProfileCredits(client, userId);
  const inventoryAfter = await snapshotCampaignInventory(client);
  const demoAccounts = othersAfter.filter((row) =>
    DEMO_PROTECTED_EMAILS.includes((row.email ?? '').trim().toLowerCase() as (typeof DEMO_PROTECTED_EMAILS)[number]),
  );
  const finalBalance = await getCreditBalance(client, userId);
  const finalTransactions = summarizeCreditTransactions(await listCreditTransactions(client, userId));

  results.push({
    id: 'isolation',
    title: '검증 계정만 변경되고 정상 캠페인·데모 계정은 불변',
    passed:
      sameProfileSnapshots(othersBefore, othersAfter) &&
      inventoryBefore.checksum === inventoryAfter.checksum &&
      finalBalance === 40_000,
    detail: {
      testUserBalance: finalBalance,
      otherProfileCount: othersAfter.length,
      demoAccounts,
      inventoryBefore,
      inventoryAfter,
      othersUnchanged: sameProfileSnapshots(othersBefore, othersAfter),
      campaignsUnchanged: inventoryBefore.checksum === inventoryAfter.checksum,
      ledger: finalTransactions,
    },
  });

  return results;
}
