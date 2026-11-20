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
  code: 'INSUFFICIENT_CREDIT' | 'INVALID_AMOUNT' | 'PROFILE_NOT_FOUND' | 'INVALID_TYPE' | 'RPC_ERROR';
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
