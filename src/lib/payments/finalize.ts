import { bidAmountFromAdvertiserCharge } from '@/lib/fees';
import { applyPaidAuctionStatus } from '@/lib/payments/apply-paid-status';
import { updateIntent } from '@/lib/payments/intent';
import { persistPayment, type PersistPaymentResult } from '@/lib/payments/persist';
import { issueTaxInvoice } from '@/lib/popbill';
import type { PaymentSupabaseConfig } from '@/lib/supabase/payment-config';
import type { PaymentIntent } from '@/types/payment';

export type FinalizeIntent = Pick<
  PaymentIntent,
  'orderId' | 'auctionId' | 'bidId' | 'amount' | 'orderName'
>;

export type FinalizeConfirmedResult =
  | {
      ok: true;
      saved: boolean;
      taxInvoice: {
        status: 'issued' | 'fallback' | 'error';
        mgtKey: string;
        message: string;
      } | null;
    }
  | (PersistPaymentResult & { ok: false });

async function issuePaidTaxInvoice(intent: FinalizeIntent) {
  try {
    const result = await issueTaxInvoice({
      paymentOrderId: intent.orderId,
      auctionId: intent.auctionId,
      bidId: intent.bidId,
      bidAmount: bidAmountFromAdvertiserCharge(intent.amount),
      itemName: intent.orderName,
    });
    return {
      status: result.status,
      mgtKey: result.mgtKey,
      message: result.message,
    };
  } catch (error) {
    console.warn('[SponsorAuction] 결제 후 세금계산서 신청 예외', error);
    return null;
  }
}

export async function finalizeConfirmedPayment(
  intent: FinalizeIntent,
  paymentKey: string,
  dbConfig: PaymentSupabaseConfig,
  options?: { allowUnsaved?: boolean },
): Promise<FinalizeConfirmedResult> {
  const saved = await persistPayment(intent, 'confirmed', paymentKey, dbConfig);
  if (!saved.ok && !options?.allowUnsaved) {
    return saved;
  }
  if (!saved.ok) {
    console.error('[SponsorAuction] demo 결제 저장 실패, 낙찰은 계속 진행', saved);
  }

  await applyPaidAuctionStatus(intent.auctionId, intent.bidId, dbConfig, {
    orderId: intent.orderId,
    amount: intent.amount,
    orderName: intent.orderName,
  });
  const taxInvoice = await issuePaidTaxInvoice(intent);
  updateIntent(intent.orderId, {
    status: 'confirmed',
    paymentKey,
  });

  return { ok: true, saved: saved.ok, taxInvoice };
}
