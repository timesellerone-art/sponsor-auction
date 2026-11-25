import {
  campaignAwardOrderId,
  campaignHoldQuote,
  holdCampaignPayment,
  releaseCampaignPaymentIfOpen,
} from '@/lib/campaign-credit';
import { applyPaidAuctionStatus } from '@/lib/payments/apply-paid-status';
import { persistPayment } from '@/lib/payments/persist';
import { readPaymentSupabaseConfig } from '@/lib/supabase/payment-config';
import { isPlatformType } from '@/lib/platforms';
import type { SponsorAuctionClient } from '@/lib/supabase';
import type { AuctionItem, AuctionStatus } from '@/types/auction';

const ORDER_NAME = '캠페인 크레딧 예치 낙찰';

export type CreditAwardResult =
  | { ok: true; data: AuctionItem; amount: number; orderId: string }
  | { ok: false; status: number; error: string; errorCode: string; neededAmount?: number };

function asAwarded(auction: AuctionItem, bidId: string): AuctionItem {
  return {
    ...auction,
    winnerBidId: auction.winnerBidId || bidId,
    status: auction.status === 'cancelled' ? auction.status : 'closed',
  };
}

function mapAwardAuction(
  row: {
    id: string;
    title?: string | null;
    platform?: string | null;
    budget?: number | null;
    description?: string | null;
    status?: string | null;
    is_blind?: boolean | null;
    author_id?: string | null;
    author_name?: string | null;
    winner_bid_id?: string | null;
    deadline?: string | null;
    created_at?: string | null;
    bids_count?: number | null;
  },
  bidId: string,
): AuctionItem {
  const platformRaw = String(row.platform ?? '');
  const status = (row.status ?? 'closed') as AuctionStatus;
  return asAwarded(
    {
      id: row.id,
      title: row.title ?? '제목 없음',
      platform: isPlatformType(platformRaw) ? platformRaw : 'other',
      budget: row.budget ?? 0,
      description: row.description ?? '',
      status,
      isBlind: Boolean(row.is_blind),
      authorId: row.author_id ?? null,
      authorName: row.author_name?.trim() || '미상',
      winnerBidId: row.winner_bid_id ?? null,
      deadline: row.deadline ?? '',
      createdAt: row.created_at ?? '',
      bidsCount: row.bids_count ?? 0,
    },
    bidId,
  );
}

async function loadAwardAuction(
  admin: SponsorAuctionClient,
  auctionId: string,
  bidId: string,
): Promise<AuctionItem | null> {
  const result = await admin
    .from('auctions')
    .select(
      'id, title, platform, budget, description, status, is_blind, author_id, author_name, winner_bid_id, deadline, created_at, bids_count',
    )
    .eq('id', auctionId)
    .maybeSingle();
  if (result.error || !result.data) {
    return null;
  }
  return mapAwardAuction(result.data, bidId);
}

function holdFailure(held: { code: string; message: string }, neededAmount: number): CreditAwardResult {
  const status =
    held.code === 'INSUFFICIENT_CREDIT'
      ? 402
      : held.code === 'ALREADY_AWARDED'
        ? 409
        : held.code === 'FORBIDDEN'
          ? 403
          : 400;
  return {
    ok: false,
    status,
    error: held.message,
    errorCode: held.code,
    neededAmount,
  };
}

async function commitAwardedTables(
  admin: SponsorAuctionClient,
  input: {
    auctionId: string;
    bidId: string;
    amount: number;
    orderId: string;
    fallback?: AuctionItem | null;
  },
): Promise<CreditAwardResult> {
  const saved = await persistPayment(
    {
      orderId: input.orderId,
      auctionId: input.auctionId,
      bidId: input.bidId,
      amount: input.amount,
      orderName: ORDER_NAME,
    },
    'confirmed',
    `credit:${input.orderId}`,
    undefined,
    admin,
  );
  if (!saved.ok) {
    await releaseCampaignPaymentIfOpen(admin, {
      orderId: input.orderId,
      auctionId: input.auctionId,
      bidId: input.bidId,
      reason: '결제 기록 저장 실패로 크레딧 복구',
    });
    return {
      ok: false,
      status: 500,
      error: saved.errorMessage,
      errorCode: saved.errorCode,
    };
  }

  const paymentMeta = { orderId: input.orderId, amount: input.amount, orderName: ORDER_NAME };
  let applied = false;
  for (let attempt = 0; attempt < 3 && !applied; attempt += 1) {
    applied = await applyPaidAuctionStatus(
      input.auctionId,
      input.bidId,
      readPaymentSupabaseConfig(),
      paymentMeta,
      admin,
    );
  }

  const awarded = (await loadAwardAuction(admin, input.auctionId, input.bidId)) ?? input.fallback ?? null;
  if (!applied || !awarded?.winnerBidId || awarded.winnerBidId !== input.bidId) {
    return {
      ok: false,
      status: 500,
      error: '캠페인 낙찰 상태를 저장하지 못했습니다. 예치는 유지됩니다.',
      errorCode: 'AWARD_FAILED',
    };
  }

  return {
    ok: true,
    data: asAwarded(awarded, input.bidId),
    amount: input.amount,
    orderId: input.orderId,
  };
}

export async function awardCampaignWithCredit(
  admin: SponsorAuctionClient,
  input: {
    auctionId: string;
    bidId: string;
    actorUserId: string;
    actorIsAdmin?: boolean;
  },
): Promise<CreditAwardResult> {
  const auctionId = input.auctionId.trim();
  const bidId = input.bidId.trim();

  const bidRow = await admin
    .from('bids')
    .select('bid_amount, status, auction_id')
    .eq('id', bidId)
    .eq('auction_id', auctionId)
    .maybeSingle();
  if (bidRow.error || !bidRow.data) {
    return {
      ok: false,
      status: 400,
      error: '해당 제안을 찾을 수 없습니다.',
      errorCode: 'AWARD_TARGET_NOT_FOUND',
    };
  }

  const holdQuote = campaignHoldQuote(bidRow.data.bid_amount ?? 0);
  const current = await loadAwardAuction(admin, auctionId, bidId);
  if (current?.winnerBidId && current.winnerBidId !== bidId) {
    return {
      ok: false,
      status: 409,
      error: '이미 다른 제안이 채택된 캠페인입니다.',
      errorCode: 'ALREADY_AWARDED',
      neededAmount: holdQuote.amount,
    };
  }

  const orderId = campaignAwardOrderId(auctionId, bidId);
  const held = await holdCampaignPayment(admin, {
    orderId,
    auctionId,
    bidId,
    actorUserId: input.actorUserId,
    actorIsAdmin: Boolean(input.actorIsAdmin),
  });
  if (!held.ok) {
    return holdFailure(held, holdQuote.amount);
  }

  return commitAwardedTables(admin, {
    auctionId,
    bidId,
    amount: held.amount || holdQuote.amount,
    orderId,
    fallback: current,
  });
}
