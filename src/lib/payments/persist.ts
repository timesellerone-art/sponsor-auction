import { createPaymentDbClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';
import type { PaymentIntent, PaymentIntentStatus } from '@/types/payment';

type PaymentRow = Database['public']['Tables']['payments']['Insert'];

export type PersistPaymentResult =
  | { ok: true; skipped: false }
  | { ok: true; skipped: true; reason: string }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      supabaseError: {
        message: string;
        code?: string;
        details?: string;
        hint?: string;
      };
    };

function logSupabaseError(
  action: string,
  supabaseError: {
    message: string;
    code?: string;
    details?: string;
    hint?: string;
  },
  row: Record<string, unknown>,
) {
  console.error('[SponsorAuction] payments 저장 실패', {
    action,
    supabaseError,
    row: {
      order_id: row.order_id,
      auction_id: row.auction_id,
      bid_id: row.bid_id,
      amount: row.amount,
      status: row.status,
      order_name: row.order_name,
      has_payment_key: Boolean(row.payment_key),
    },
  });
}

function toRow(
  intent: Pick<PaymentIntent, 'orderId' | 'auctionId' | 'bidId' | 'amount' | 'orderName'>,
  status: PaymentIntentStatus,
  paymentKey: string | null,
): PaymentRow {
  const amount = Number(intent.amount);
  return {
    order_id: String(intent.orderId),
    auction_id: String(intent.auctionId),
    bid_id: String(intent.bidId),
    amount,
    order_name: String(intent.orderName),
    status,
    payment_key: paymentKey,
    confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
  };
}

export async function persistPayment(
  intent: Pick<PaymentIntent, 'orderId' | 'auctionId' | 'bidId' | 'amount' | 'orderName'>,
  status: PaymentIntentStatus,
  paymentKey: string | null,
): Promise<PersistPaymentResult> {
  const { client, usingServiceRole, serviceRoleSource, missing } = createPaymentDbClient();
  if (!client) {
    console.error('[SponsorAuction] payments 저장 생략: 서버용 Supabase 환경 변수가 없습니다.', {
      order_id: intent.orderId,
      status,
      expected: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'],
      env: missing,
    });
    return { ok: true, skipped: true, reason: 'SUPABASE_ADMIN_NOT_CONFIGURED' };
  }

  const row = toRow(intent, status, paymentKey);

  if (!Number.isInteger(row.amount) || row.amount <= 0) {
    const supabaseError = {
      message: `amount 타입이 올바르지 않습니다: ${typeof intent.amount} / ${String(intent.amount)}`,
      code: 'AMOUNT_TYPE',
    };
    logSupabaseError('validate', supabaseError, row);
    return {
      ok: false,
      errorCode: 'PAYMENT_AMOUNT_TYPE',
      errorMessage: supabaseError.message,
      supabaseError,
    };
  }

  console.info('[SponsorAuction] payments upsert', {
    order_id: row.order_id,
    auction_id: row.auction_id,
    bid_id: row.bid_id,
    amount: row.amount,
    status: row.status,
    usingServiceRole,
    serviceRoleSource,
  });

  const { error } = await client.from('payments').upsert(row, { onConflict: 'order_id' });

  if (error) {
    const supabaseError = {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    };
    logSupabaseError('upsert', supabaseError, row);
    return {
      ok: false,
      errorCode: error.code || 'PAYMENT_DB_SAVE_FAILED',
      errorMessage: error.message,
      supabaseError,
    };
  }

  console.info('[SponsorAuction] payments 저장 성공', {
    order_id: row.order_id,
    amount: row.amount,
    status: row.status,
  });
  return { ok: true, skipped: false };
}
