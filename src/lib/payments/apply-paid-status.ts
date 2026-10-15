import { createClient } from '@supabase/supabase-js';
import type { PaymentSupabaseConfig } from '@/lib/supabase/payment-config';
import type { Database } from '@/types/database';

function createSupabaseAdmin(config: PaymentSupabaseConfig) {
  const key = config.serviceKey || config.anonKey;
  if (!config.url || !key) {
    return null;
  }

  return createClient<Database>(config.url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-client-info': 'sponsor-auction-payments-admin',
      },
    },
  });
}

/** 결제 승인 이후 경매/입찰 상태만 맞춥니다. 실패해도 결제 승인을 되돌리지 않습니다. */
export async function applyPaidAuctionStatus(
  auctionId: string,
  bidId: string,
  config: PaymentSupabaseConfig,
) {
  try {
    if (!auctionId || !bidId) {
      console.error('[SponsorAuction] 결제 후 상태 업데이트 생략: auctionId/bidId 없음', {
        auctionId,
        bidId,
      });
      return;
    }

    const supabaseAdmin = createSupabaseAdmin(config);
    if (!supabaseAdmin) {
      console.error('[SponsorAuction] 결제 후 상태 업데이트 생략: supabaseAdmin 생성 실패', {
        auctionId,
        bidId,
        hasUrl: Boolean(config.url),
        hasServiceKey: Boolean(config.serviceKey),
        hasAnonKey: Boolean(config.anonKey),
      });
      return;
    }

    const bidUpdate = await supabaseAdmin
      .from('bids')
      .update({ status: 'selected' })
      .eq('id', bidId);

    if (bidUpdate.error) {
      console.error('[SponsorAuction] 결제 후 bids.status=selected 업데이트 실패', {
        auctionId,
        bidId,
        supabaseError: {
          message: bidUpdate.error.message,
          code: bidUpdate.error.code,
          details: bidUpdate.error.details,
          hint: bidUpdate.error.hint,
        },
      });
    } else {
      console.info('[SponsorAuction] 결제 후 bids.status=selected 반영', { bidId, auctionId });
    }

    const auctionUpdate = await supabaseAdmin
      .from('auctions')
      .update({ status: 'completed' })
      .eq('id', auctionId);

    if (auctionUpdate.error) {
      console.error('[SponsorAuction] 결제 후 auctions.status=completed 업데이트 실패', {
        auctionId,
        bidId,
        supabaseError: {
          message: auctionUpdate.error.message,
          code: auctionUpdate.error.code,
          details: auctionUpdate.error.details,
          hint: auctionUpdate.error.hint,
        },
      });
    } else {
      console.info('[SponsorAuction] 결제 후 auctions.status=completed 반영', { auctionId, bidId });
    }
  } catch (error) {
    console.error('[SponsorAuction] 결제 후 경매/입찰 상태 업데이트 예외', {
      auctionId,
      bidId,
      error,
    });
  }
}
