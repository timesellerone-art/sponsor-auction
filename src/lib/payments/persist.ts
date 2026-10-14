import 'server-only';

import { createPaymentDbClient } from '@/lib/supabase/admin';
import type { Database } from '@/types/database';
import type { PaymentIntent, PaymentIntentStatus } from '@/types/payment';

type PaymentRow = Database['public']['Tables']['payments']['Insert'];

export type PersistPaymentResult =
  | { ok: true }
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
  row: PaymentRow,
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
  return {
    order_id: String(intent.orderId),
    auction_id: String(intent.auctionId),
    bid_id: String(intent.bidId),
    amount: Number(intent.amount),
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
  const { client, usingServiceRole, keySource, missing } = createPaymentDbClient();
  if (!client) {
    const errorMessage =
      'Supabase 환경 변수를 읽지 못해 payments를 저장하지 못했습니다. Vercel에 NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY(또는 NEXT_PUBLIC_SUPABASE_ANON_KEY)를 등록하세요.';
    console.error('[SponsorAuction] payments 저장 실패: 환경 변수가 undefined입니다.', {
      order_id: intent.orderId,
      status,
      undefinedNames: missing.undefinedNames,
      presence: missing.presence,
      hasUrl: missing.hasUrl,
      hasServiceRole: missing.hasServiceRole,
      hasAnon: missing.hasAnon,
    });
    return {
      ok: false,
      errorCode: 'SUPABASE_ENV_UNDEFINED',
      errorMessage,
      supabaseError: {
        message: errorMessage,
        code: 'SUPABASE_ENV_UNDEFINED',
        details: missing.undefinedNames.join(', '),
        hint: '키 값은 로그하지 않습니다. Vercel Environment Variables에서 undefined인 이름을 확인하세요.',
      },
    };
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

  console.info('[SponsorAuction] payments 저장 시도', {
    order_id: row.order_id,
    auction_id: row.auction_id,
    bid_id: row.bid_id,
    amount: row.amount,
    status: row.status,
    usingServiceRole,
    keySource,
  });

  const upsert = await client.from('payments').upsert(row, { onConflict: 'order_id' }).select('order_id');
  if (!upsert.error) {
    console.info('[SponsorAuction] payments 저장 성공', {
      order_id: row.order_id,
      amount: row.amount,
      status: row.status,
      method: 'upsert',
    });
    return { ok: true };
  }

  logSupabaseError('upsert', {
    message: upsert.error.message,
    code: upsert.error.code,
    details: upsert.error.details,
    hint: upsert.error.hint,
  }, row);

  const inserted = await client.from('payments').insert(row).select('order_id');
  if (!inserted.error) {
    console.info('[SponsorAuction] payments 저장 성공', {
      order_id: row.order_id,
      amount: row.amount,
      status: row.status,
      method: 'insert',
    });
    return { ok: true };
  }

  logSupabaseError('insert', {
    message: inserted.error.message,
    code: inserted.error.code,
    details: inserted.error.details,
    hint: inserted.error.hint,
  }, row);

  if (inserted.error.code === '23505') {
    const updated = await client
      .from('payments')
      .update({
        status: row.status,
        payment_key: row.payment_key,
        confirmed_at: row.confirmed_at,
      })
      .eq('order_id', row.order_id)
      .select('order_id');
    if (!updated.error) {
      console.info('[SponsorAuction] payments 저장 성공', {
        order_id: row.order_id,
        amount: row.amount,
        status: row.status,
        method: 'update',
      });
      return { ok: true };
    }
    logSupabaseError('update', {
      message: updated.error.message,
      code: updated.error.code,
      details: updated.error.details,
      hint: updated.error.hint,
    }, row);
  }

  const last = inserted.error;
  const extraHint =
    last.code === '42501' || /permission denied|row-level security/i.test(last.message)
      ? ' Vercel에 SUPABASE_SERVICE_ROLE_KEY를 등록하거나 payments INSERT/SELECT RLS를 확인해 주세요.'
      : last.code === '22P02'
        ? ' auction_id/bid_id 컬럼 타입을 text로 바꾸는 schema.sql을 Supabase에 실행해 주세요.'
        : '';

  return {
    ok: false,
    errorCode: last.code || 'PAYMENT_DB_SAVE_FAILED',
    errorMessage: `${last.message}${extraHint}`,
    supabaseError: {
      message: last.message,
      code: last.code,
      details: last.details,
      hint: last.hint,
    },
  };
}
