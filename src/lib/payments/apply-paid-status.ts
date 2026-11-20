import { createClient } from '@supabase/supabase-js';
import { upsertPaidPayout } from '@/lib/payouts';
import type { PaymentSupabaseConfig } from '@/lib/supabase/payment-config';
import type { Database } from '@/types/database';
import { isUuid } from '@/lib/uuid';

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

/** 결제 승인 이후 경매/입찰 상태를 맞춥니다. 실캠페인 반영에 실패하면 false입니다. */
export async function applyPaidAuctionStatus(
  auctionId: string,
  bidId: string,
  config: PaymentSupabaseConfig,
  payment?: { orderId: string; amount: number; orderName: string },
) {
  try {
    if (!auctionId || !bidId) {
      console.error('[SponsorAuction] 결제 후 상태 업데이트 생략: auctionId/bidId 없음', {
        auctionId,
        bidId,
      });
      return false;
    }
    if (!isUuid(auctionId) || !isUuid(bidId)) {
      console.info('[SponsorAuction] 결제 후 상태 업데이트 생략: mock ID는 UUID 컬럼에 쓰지 않습니다.', {
        auctionId,
        bidId,
      });
      return true;
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
      return false;
    }

    const currentAuction = await supabaseAdmin
      .from('auctions')
      .select('winner_bid_id, status')
      .eq('id', auctionId)
      .maybeSingle();
    const existingWinner = currentAuction.data?.winner_bid_id ?? null;
    if (existingWinner && existingWinner !== bidId) {
      console.error('[SponsorAuction] 결제 후 상태 업데이트 생략: 다른 낙찰이 이미 있습니다.', {
        auctionId,
        bidId,
        existingWinner,
      });
      return false;
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
      .update({ status: 'completed', winner_bid_id: bidId })
      .eq('id', auctionId)
      .or(`winner_bid_id.is.null,winner_bid_id.eq.${bidId}`)
      .select('id');

    if (auctionUpdate.error || !auctionUpdate.data?.length) {
      if (existingWinner === bidId) {
        console.info('[SponsorAuction] 결제 후 낙찰 상태가 이미 반영되어 있습니다.', { auctionId, bidId });
      } else {
        console.error('[SponsorAuction] 결제 후 auctions.status=completed 업데이트 실패', {
          auctionId,
          bidId,
          supabaseError: auctionUpdate.error
            ? {
                message: auctionUpdate.error.message,
                code: auctionUpdate.error.code,
                details: auctionUpdate.error.details,
                hint: auctionUpdate.error.hint,
              }
            : null,
        });
        return false;
      }
    } else {
      console.info('[SponsorAuction] 결제 후 auctions.status=completed 반영', { auctionId, bidId });
    }

    if (payment?.orderId) {
      await upsertPaidPayout(supabaseAdmin, {
        orderId: payment.orderId,
        auctionId,
        bidId,
        chargeAmount: payment.amount,
        orderName: payment.orderName,
      });
    }
    return true;
  } catch (error) {
    console.error('[SponsorAuction] 결제 후 경매/입찰 상태 업데이트 예외', {
      auctionId,
      bidId,
      error,
    });
    return false;
  }
}
