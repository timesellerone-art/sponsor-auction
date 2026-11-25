import { createClient } from '@supabase/supabase-js';
import { upsertPaidPayout } from '@/lib/payouts';
import { createAdminClient } from '@/lib/supabase/admin';
import type { PaymentSupabaseConfig } from '@/lib/supabase/payment-config';
import type { SponsorAuctionClient } from '@/lib/supabase';
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

function paidClient(config: PaymentSupabaseConfig, client?: SponsorAuctionClient | null) {
  return client ?? createAdminClient() ?? createSupabaseAdmin(config);
}

function hasWinner(winnerId: string | null | undefined, bidId: string) {
  return Boolean(winnerId && winnerId === bidId);
}

type WinnerRow = {
  id?: string;
  status?: string | null;
  winner_bid_id?: string | null;
};

function logWriteError(
  action: string,
  auctionId: string,
  bidId: string,
  error: { message: string; code?: string; details?: string; hint?: string } | null,
) {
  if (!error) {
    return;
  }
  console.error('[SponsorAuction] 결제 후 낙찰 쓰기 실패', {
    action,
    auctionId,
    bidId,
    supabaseError: {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    },
  });
}

async function selectWinner(
  client: SponsorAuctionClient,
  auctionId: string,
  bidId: string,
) {
  const selected = await client
    .from('bids')
    .update({ status: 'selected' })
    .eq('id', bidId)
    .eq('auction_id', auctionId);
  if (selected.error) {
    console.error('[SponsorAuction] 결제 후 bids.status=selected 업데이트 실패', {
      auctionId,
      bidId,
      supabaseError: {
        message: selected.error.message,
        code: selected.error.code,
        details: selected.error.details,
        hint: selected.error.hint,
      },
    });
    return false;
  }
  const check = await client
    .from('bids')
    .select('status')
    .eq('id', bidId)
    .eq('auction_id', auctionId)
    .maybeSingle();
  return check.data?.status === 'selected';
}

async function ensureClosed(
  client: SponsorAuctionClient,
  auctionId: string,
  bidId: string,
  row: WinnerRow | null,
) {
  if (!hasWinner(row?.winner_bid_id, bidId)) {
    return null;
  }
  if (row?.status === 'closed') {
    return { id: auctionId, status: 'closed' as const, winner_bid_id: bidId };
  }

  const closed = await client
    .from('auctions')
    .update({ status: 'closed' })
    .eq('id', auctionId)
    .eq('winner_bid_id', bidId)
    .select('id, status, winner_bid_id')
    .maybeSingle();
  if (closed.error) {
    logWriteError('ensure-closed', auctionId, bidId, closed.error);
  } else if (hasWinner(closed.data?.winner_bid_id, bidId)) {
    return {
      id: auctionId,
      status: closed.data?.status === 'closed' ? 'closed' : closed.data?.status || row?.status || 'closed',
      winner_bid_id: bidId,
    };
  }

  return {
    id: auctionId,
    status: row?.status || 'closed',
    winner_bid_id: bidId,
  };
}

async function writeWinner(
  client: SponsorAuctionClient,
  auctionId: string,
  bidId: string,
) {
  const current = await client
    .from('auctions')
    .select('id, status, winner_bid_id')
    .eq('id', auctionId)
    .maybeSingle();
  if (hasWinner(current.data?.winner_bid_id, bidId)) {
    return ensureClosed(client, auctionId, bidId, current.data);
  }

  const rpc = await client.rpc('award_auction', {
    p_auction_id: auctionId,
    p_bid_id: bidId,
  });
  if (rpc.error) {
    logWriteError('award_auction', auctionId, bidId, rpc.error);
  } else if (rpc.data && typeof rpc.data === 'object' && 'winner_bid_id' in rpc.data) {
    const row = rpc.data as WinnerRow;
    if (hasWinner(row.winner_bid_id, bidId)) {
      return ensureClosed(client, auctionId, bidId, row);
    }
  }

  const closed = await client
    .from('auctions')
    .update({ status: 'closed', winner_bid_id: bidId })
    .eq('id', auctionId)
    .eq('status', 'active')
    .is('winner_bid_id', null)
    .select('id, status, winner_bid_id')
    .maybeSingle();
  if (closed.error) {
    logWriteError('update-closed', auctionId, bidId, closed.error);
  } else if (hasWinner(closed.data?.winner_bid_id, bidId)) {
    return ensureClosed(client, auctionId, bidId, closed.data);
  }

  const retry = await client
    .from('auctions')
    .select('id, status, winner_bid_id')
    .eq('id', auctionId)
    .maybeSingle();
  if (hasWinner(retry.data?.winner_bid_id, bidId)) {
    return ensureClosed(client, auctionId, bidId, retry.data);
  }
  return null;
}

/** 결제 승인 이후 경매/입찰/정산을 한 번에 맞춥니다. 실캠페인 반영에 실패하면 false입니다. */
export async function applyPaidAuctionStatus(
  auctionId: string,
  bidId: string,
  config: PaymentSupabaseConfig,
  payment?: { orderId: string; amount: number; orderName: string },
  client?: SponsorAuctionClient | null,
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

    const supabaseAdmin = paidClient(config, client);
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

    const awarded = await writeWinner(supabaseAdmin, auctionId, bidId);
    if (!hasWinner(awarded?.winner_bid_id, bidId)) {
      console.error('[SponsorAuction] 결제 후 auctions.winner_bid_id 저장 실패', {
        auctionId,
        bidId,
      });
      return false;
    }
    const bidSelected = await selectWinner(supabaseAdmin, auctionId, bidId);
    if (!bidSelected) {
      const retried = await selectWinner(supabaseAdmin, auctionId, bidId);
      if (!retried) {
        console.error('[SponsorAuction] 결제 후 bids.status=selected 저장 실패', {
          auctionId,
          bidId,
        });
        return false;
      }
    }

    let payoutOk = true;
    if (payment?.orderId) {
      payoutOk = await upsertPaidPayout(supabaseAdmin, {
        orderId: payment.orderId,
        auctionId,
        bidId,
        chargeAmount: payment.amount,
        orderName: payment.orderName,
      });
      if (!payoutOk) {
        payoutOk = await upsertPaidPayout(supabaseAdmin, {
          orderId: payment.orderId,
          auctionId,
          bidId,
          chargeAmount: payment.amount,
          orderName: payment.orderName,
        });
      }
    }

    console.info('[SponsorAuction] 결제 후 낙찰 상태 반영', {
      auctionId,
      bidId,
      status: awarded?.status,
      payoutOk,
    });
    return payoutOk;
  } catch (error) {
    console.error('[SponsorAuction] 결제 후 경매/입찰 상태 업데이트 예외', {
      auctionId,
      bidId,
      error,
    });
    return false;
  }
}
