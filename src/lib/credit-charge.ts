import { randomBytes } from 'crypto';
import type { CreditLedgerClient, CreditMutationResult } from '@/lib/credits';
import { chargeUserCredit, getCreditBalance } from '@/lib/credits';
import {
  assessCreditCharge,
  CREDIT_CHARGE_ORDER_NAME,
  CREDIT_CHARGE_ORDER_PREFIX,
  isCreditChargeAmount,
  isCreditChargeOrderId,
  type CreditChargeOutcome,
} from '@/lib/credit-charge-shared';

export {
  assessCreditCharge,
  CREDIT_CHARGE_AMOUNTS,
  CREDIT_CHARGE_ORDER_NAME,
  demoCreditPaymentKey,
  isCreditChargeAmount,
  isCreditChargeOrderId,
} from '@/lib/credit-charge-shared';

export type CreditChargeOrderStatus = 'pending' | 'confirmed' | 'failed' | 'cancelled';

export type CreditChargeOrder = {
  orderId: string;
  userId: string;
  amount: number;
  status: CreditChargeOrderStatus;
  paymentKey: string | null;
};

function createCreditChargeOrderId() {
  return `${CREDIT_CHARGE_ORDER_PREFIX}${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
}

function asOrder(row: {
  order_id: string;
  user_id: string;
  amount: number;
  status: CreditChargeOrderStatus;
  payment_key: string | null;
}): CreditChargeOrder {
  return {
    orderId: row.order_id,
    userId: row.user_id,
    amount: row.amount,
    status: row.status,
    paymentKey: row.payment_key,
  };
}

export async function loadCreditChargeOrder(client: CreditLedgerClient, orderId: string) {
  const id = orderId.trim();
  if (!isCreditChargeOrderId(id)) {
    return null;
  }
  const { data, error } = await client
    .from('credit_charge_orders')
    .select('order_id, user_id, amount, status, payment_key')
    .eq('order_id', id)
    .maybeSingle();
  if (error) {
    throw new Error(error.message);
  }
  return data ? asOrder(data) : null;
}

export async function createCreditChargeOrder(
  client: CreditLedgerClient,
  userId: string,
  amount: number,
) {
  if (!isCreditChargeAmount(amount)) {
    return { ok: false as const, code: 'INVALID_AMOUNT' as const, message: '충전 금액이 올바르지 않습니다.' };
  }
  const orderId = createCreditChargeOrderId();
  const { data, error } = await client
    .from('credit_charge_orders')
    .insert({
      order_id: orderId,
      user_id: userId,
      amount,
      status: 'pending',
    })
    .select('order_id, user_id, amount, status, payment_key')
    .single();
  if (error || !data) {
    return {
      ok: false as const,
      code: 'ORDER_CREATE_FAILED' as const,
      message: error?.message || '충전 주문을 만들지 못했습니다.',
    };
  }
  return { ok: true as const, order: asOrder(data) };
}

export type CreditChargeSettlement =
  | {
      ok: true;
      charged: boolean;
      duplicate: boolean;
      code: 'CHARGED' | 'DUPLICATE_REFERENCE' | 'CLOSED' | 'ALREADY_CHARGED';
      balance: number | null;
      order: CreditChargeOrder;
      charge: CreditMutationResult | null;
    }
  | {
      ok: false;
      code:
        | 'ORDER_NOT_FOUND'
        | 'FORBIDDEN'
        | 'AMOUNT_MISMATCH'
        | 'PAYMENT_KEY_MISMATCH'
        | 'INVALID_PAYMENT'
        | 'CHARGE_FAILED';
      message: string;
      balance: number | null;
    };

async function markCreditChargeOrder(
  client: CreditLedgerClient,
  orderId: string,
  patch: { status: CreditChargeOrderStatus; paymentKey?: string | null },
) {
  const { data, error } = await client
    .from('credit_charge_orders')
    .update({
      status: patch.status,
      ...(patch.paymentKey !== undefined ? { payment_key: patch.paymentKey } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('order_id', orderId)
    .select('order_id, user_id, amount, status, payment_key')
    .single();
  if (error || !data) {
    throw new Error(error?.message || '충전 주문 상태를 저장하지 못했습니다.');
  }
  return asOrder(data);
}

export async function settleCreditCharge(
  client: CreditLedgerClient,
  input: {
    userId: string;
    orderId: string;
    paymentKey: string;
    paidAmount: number;
    outcome: CreditChargeOutcome;
  },
): Promise<CreditChargeSettlement> {
  const order = await loadCreditChargeOrder(client, input.orderId);
  if (!order) {
    return { ok: false, code: 'ORDER_NOT_FOUND', message: '충전 주문을 찾을 수 없습니다.', balance: null };
  }
  if (order.userId !== input.userId) {
    const balance = await getCreditBalance(client, order.userId);
    return { ok: false, code: 'FORBIDDEN', message: '이 충전 주문의 계정이 아닙니다.', balance };
  }

  const decision = assessCreditCharge({
    orderAmount: order.amount,
    paidAmount: input.paidAmount,
    outcome: input.outcome,
    paymentKey: input.paymentKey,
    boundPaymentKey: order.paymentKey,
  });

  if (decision.action === 'reject') {
    const balance = await getCreditBalance(client, order.userId);
    const message =
      decision.code === 'AMOUNT_MISMATCH'
        ? '결제 금액이 충전 주문과 다릅니다.'
        : decision.code === 'PAYMENT_KEY_MISMATCH'
          ? '결제 식별자가 충전 주문과 다릅니다.'
          : '결제 식별자가 올바르지 않습니다.';
    return { ok: false, code: decision.code, message, balance };
  }

  if (decision.action === 'close') {
    if (order.status === 'confirmed') {
      const balance = await getCreditBalance(client, order.userId);
      return {
        ok: true,
        charged: false,
        duplicate: false,
        code: 'ALREADY_CHARGED',
        balance,
        order,
        charge: null,
      };
    }
    const closed = await markCreditChargeOrder(client, order.orderId, { status: decision.status });
    const balance = await getCreditBalance(client, order.userId);
    return {
      ok: true,
      charged: false,
      duplicate: false,
      code: 'CLOSED',
      balance,
      order: closed,
      charge: null,
    };
  }

  const charge = await chargeUserCredit(client, {
    userId: order.userId,
    amount: order.amount,
    referenceId: input.paymentKey.trim(),
    description: `${CREDIT_CHARGE_ORDER_NAME} ${order.orderId}`,
  });
  const duplicate = !charge.ok && charge.error.code === 'DUPLICATE_REFERENCE';
  if (!charge.ok && !duplicate) {
    const balance = await getCreditBalance(client, order.userId);
    return {
      ok: false,
      code: 'CHARGE_FAILED',
      message: charge.error.message,
      balance,
    };
  }

  const confirmed = await markCreditChargeOrder(client, order.orderId, {
    status: 'confirmed',
    paymentKey: input.paymentKey.trim(),
  });
  const balance = charge.ok ? charge.data.balance_after : await getCreditBalance(client, order.userId);
  return {
    ok: true,
    charged: charge.ok,
    duplicate,
    code: duplicate ? 'DUPLICATE_REFERENCE' : 'CHARGED',
    balance,
    order: confirmed,
    charge,
  };
}
