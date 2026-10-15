import { createClient } from '@supabase/supabase-js';
import {
  describePaymentSupabaseConfig,
  readPaymentSupabaseConfig,
  type PaymentSupabaseConfig,
} from '@/lib/supabase/payment-config';
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
  const auctionId = String(intent.auctionId ?? '').trim();
  const bidId = String(intent.bidId ?? '').trim();
  return {
    order_id: String(intent.orderId),
    auction_id: auctionId,
    bid_id: bidId,
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
  configOverride?: Partial<PaymentSupabaseConfig>,
): Promise<PersistPaymentResult> {
  const config = readPaymentSupabaseConfig(configOverride);
  const writeKey = config.serviceKey || config.anonKey;
  const usingServiceRole = Boolean(config.serviceKey);
  const keySource = config.serviceKey
    ? 'SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY'
    : config.anonKey
      ? 'NEXT_PUBLIC_SUPABASE_ANON_KEY'
      : null;

  if (!config.url || !writeKey) {
    const described = describePaymentSupabaseConfig(config);
    const errorMessage =
      'Supabase 환경 변수를 읽지 못해 payments를 저장하지 못했습니다. Vercel Production에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY(또는 SUPABASE_SERVICE_ROLE_KEY)가 있는지 확인하세요.';
    console.error('[SponsorAuction] payments 저장 실패: 환경 변수가 undefined입니다.', {
      order_id: intent.orderId,
      status,
      ...described,
    });
    return {
      ok: false,
      errorCode: 'SUPABASE_ENV_UNDEFINED',
      errorMessage,
      supabaseError: {
        message: errorMessage,
        code: 'SUPABASE_ENV_UNDEFINED',
        details: JSON.stringify(described),
        hint: '키 값은 로그하지 않습니다. Vercel Environment Variables의 Production 범위를 확인하세요.',
      },
    };
  }

  const client = createClient<Database>(config.url, writeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const row = toRow(intent, status, paymentKey);

  if (!row.auction_id || !row.bid_id) {
    const supabaseError = {
      message: 'auction_id 또는 bid_id가 비어 있어 payments 행을 완성할 수 없습니다.',
      code: 'PAYMENT_IDS_MISSING',
    };
    logSupabaseError('validate', supabaseError, row);
    return {
      ok: false,
      errorCode: 'PAYMENT_IDS_MISSING',
      errorMessage: supabaseError.message,
      supabaseError,
    };
  }

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
      auction_id: row.auction_id,
      bid_id: row.bid_id,
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
        auction_id: row.auction_id,
        bid_id: row.bid_id,
        amount: row.amount,
        order_name: row.order_name,
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
