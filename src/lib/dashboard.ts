import { getAuctionsByAuthor, getAuctionsByIds, getBidsByAuctionIds, getBidsByCreator } from '@/lib/auctions';
import { authRequestInit } from '@/lib/auth-request';
import { payoutLinkedToBid } from '@/lib/admin-bid-status';
import { applyAdminPayoutIntegrity } from '@/lib/admin-integrity';
import { getPayouts as getMockPayouts } from '@/lib/mock-data';
import { getMyAuctionIds } from '@/lib/my-campaigns';
import { listPayoutsForCreator, payoutStatusForCreator } from '@/lib/payouts';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import { getMyBidIds } from '@/lib/my-bids';
import type { SponsorAuctionClient } from '@/lib/supabase';
import { getDataClient } from '@/lib/supabase/data-client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { uuidIds } from '@/lib/uuid';
import type { PayoutItem } from '@/types/admin';
import {
  isAuctionClosed,
  isAwardedAuction,
  isBidSelected,
  type AuctionItem,
  type BidItem,
  type DataResult,
} from '@/types/auction';
import type { SessionUser } from '@/types/auth';
import type { AdvertiserDeal, CreatorDeal, PaymentRecord } from '@/types/dashboard';

const PAYMENT_COLUMNS =
  'order_id, auction_id, bid_id, amount, status, order_name, confirmed_at';

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function mapPayment(row: {
  order_id?: string | null;
  auction_id?: string | null;
  bid_id?: string | null;
  amount?: number | null;
  status?: string | null;
  order_name?: string | null;
  confirmed_at?: string | null;
}): PaymentRecord | null {
  const orderId = row.order_id?.trim() ?? '';
  const auctionId = row.auction_id?.trim() ?? '';
  const bidId = row.bid_id?.trim() ?? '';
  if (!orderId || !auctionId) {
    return null;
  }
  return {
    orderId,
    auctionId,
    bidId,
    amount: Number(row.amount) || 0,
    status: row.status ?? 'pending',
    orderName: row.order_name ?? '',
    confirmedAt: row.confirmed_at ?? null,
  };
}

function mockPaymentsFromDeals(auctions: AuctionItem[], bids: BidItem[]): PaymentRecord[] {
  return auctions
    .filter((auction) => isAuctionClosed(auction.status))
    .map((auction) => {
      const bid =
        bids.find((item) => isBidSelected(item, auction.winnerBidId) && item.auctionId === auction.id) ??
        null;
      if (!bid) {
        return null;
      }
      return {
        orderId: `ord_mock_${auction.id}`,
        auctionId: auction.id,
        bidId: bid.id,
        amount: describeSettlementAmounts(bid.bidAmount).advertiserCharge,
        status: 'confirmed',
        orderName: auction.title,
        confirmedAt: auction.createdAt || null,
      } satisfies PaymentRecord;
    })
    .filter((item): item is PaymentRecord => Boolean(item));
}

/** 광고주 영역: 본인 캠페인에 대한 결제(크레딧 예치)만 조회합니다. */
async function loadAdvertiserPayments(
  auctionIds: string[],
  client?: SponsorAuctionClient | null,
): Promise<PaymentRecord[]> {
  const ids = uuidIds(auctionIds);
  if (ids.length === 0) {
    return [];
  }
  const supabase = client ?? (await getDataClient());
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('payments')
      .select(PAYMENT_COLUMNS)
      .eq('status', 'confirmed')
      .in('auction_id', ids)
      .order('confirmed_at', { ascending: false });

    if (error) {
      if (!isSchemaMismatch(error)) {
        console.error('[SponsorAuction] 광고주 결제 목록 조회 실패:', error.message, error);
      }
      return [];
    }

    return (data ?? [])
      .map((row) => mapPayment(row))
      .filter((item): item is PaymentRecord => Boolean(item));
  } catch (error) {
    console.error('[SponsorAuction] 광고주 결제 목록 조회 예외', error);
    return [];
  }
}

function displayAuction(
  auction: AuctionItem,
  awarded: boolean,
  winnerBidId?: string | null,
): AuctionItem {
  if (!awarded && !winnerBidId) {
    return auction;
  }
  return {
    ...auction,
    status:
      auction.status === 'cancelled'
        ? auction.status
        : isAuctionClosed(auction.status)
          ? auction.status
          : awarded || winnerBidId
            ? 'closed'
            : auction.status,
    winnerBidId: auction.winnerBidId || winnerBidId || null,
  };
}

function withSelectedWinner(bids: BidItem[], winnerBidId: string | null) {
  if (!winnerBidId) {
    return bids;
  }
  return bids.map((bid) =>
    bid.id === winnerBidId || bid.status === 'selected' ? { ...bid, status: 'selected' as const } : bid,
  );
}

function pickCreatorBids(all: BidItem[], user: SessionUser) {
  const mine = new Set(getMyBidIds());
  return all.filter((bid) => {
    if (bid.creatorId && bid.creatorId === user.id) {
      return true;
    }
    if (mine.has(bid.id)) {
      return true;
    }
    return !bid.creatorId && Boolean(bid.creatorName && bid.creatorName === user.name);
  });
}

function payoutForCreatorBid(
  payouts: PayoutItem[],
  bid: BidItem,
  auction: AuctionItem | null,
) {
  const linked = payouts.filter((item) => payoutLinkedToBid(item, bid, auction ?? undefined));
  return linked.find((item) => item.status === 'paid') ?? linked[0] ?? null;
}

function filterCreatorPayouts(
  payouts: PayoutItem[],
  userId: string,
  bidIds: string[],
  auctionIds: string[],
) {
  const bidSet = new Set(bidIds);
  const auctionSet = new Set(auctionIds);
  return payouts.filter(
    (item) =>
      (item.creatorId && item.creatorId === userId) ||
      (item.bidId && bidSet.has(item.bidId)) ||
      (item.auctionId && auctionSet.has(item.auctionId)),
  );
}

async function loadCreatorPayouts(
  userId: string,
  bidIds: string[],
  auctionIds: string[],
): Promise<PayoutItem[]> {
  if (typeof window !== 'undefined') {
    try {
      const response = await fetch(
        '/api/account/payouts',
        await authRequestInit({ cache: 'no-store' }),
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: PayoutItem[];
      } | null;
      if (response.ok && Array.isArray(payload?.data)) {
        return payload.data;
      }
    } catch (error) {
      console.warn('[SponsorAuction] 크리에이터 정산 API 조회 실패', error);
    }
  }

  const supabase = await getDataClient();
  if (supabase) {
    return listPayoutsForCreator(supabase, { creatorId: userId, bidIds, auctionIds });
  }
  const mock = await getMockPayouts();
  return filterCreatorPayouts(Array.isArray(mock.data) ? mock.data : [], userId, bidIds, auctionIds);
}

export function assembleAdvertiserDeals(
  auctions: AuctionItem[],
  bids: BidItem[],
  livePayments: PaymentRecord[],
): AdvertiserDeal[] {
  const uniqueAuctions = uniqueById(auctions);
  const payments =
    livePayments.length > 0 ? livePayments : mockPaymentsFromDeals(uniqueAuctions, bids);
  const paymentByAuction = new Map(payments.map((item) => [item.auctionId, item]));

  const deals: AdvertiserDeal[] = uniqueAuctions.map((auction) => {
    const auctionBids = bids.filter((item) => item.auctionId === auction.id);
    const payment = paymentByAuction.get(auction.id) ?? null;
    const bid =
      auctionBids.find((item) => item.id === payment?.bidId) ??
      auctionBids.find((item) => isBidSelected(item, auction.winnerBidId)) ??
      null;
    const awarded = isAwardedAuction(auction) || payment?.status === 'confirmed';
    const winnerBidId = auction.winnerBidId || payment?.bidId || null;
    return {
      auction: displayAuction(auction, awarded, winnerBidId),
      bid: bid
        ? winnerBidId === bid.id || bid.status === 'selected'
          ? { ...bid, status: 'selected' as const }
          : bid
        : null,
      bids: withSelectedWinner(auctionBids, winnerBidId),
      payment: payment?.status === 'confirmed' ? payment : null,
    };
  });

  deals.sort((left, right) => {
    const leftPaid = isAwardedAuction(left.auction) ? 1 : 0;
    const rightPaid = isAwardedAuction(right.auction) ? 1 : 0;
    if (leftPaid !== rightPaid) {
      return rightPaid - leftPaid;
    }
    return (right.auction.createdAt || '').localeCompare(left.auction.createdAt || '');
  });
  return deals;
}

export async function loadAdvertiserDashboardFromClient(
  client: SponsorAuctionClient,
  userId: string,
  extraIds: string[] = [],
): Promise<DataResult<AdvertiserDeal[]>> {
  const auctionResult = await getAuctionsByAuthor(userId, { client, extraIds });
  const auctions = uniqueById(Array.isArray(auctionResult.data) ? auctionResult.data : []);
  const auctionIds = auctions.map((item) => item.id);
  const [bidResult, livePayments] = await Promise.all([
    getBidsByAuctionIds(auctionIds, { client }),
    loadAdvertiserPayments(auctionIds, client),
  ]);
  const deals = assembleAdvertiserDeals(
    auctions,
    Array.isArray(bidResult.data) ? bidResult.data : [],
    livePayments,
  );
  if (auctions.length === 0 && auctionResult.error) {
    return fail([], auctionResult.error);
  }
  return ok(deals);
}

/**
 * 광고주 영역 조회.
 * - 캠페인: 본인이 등록한 auctions만
 * - 제안: 그 캠페인에 달린 bids만
 * - 결제: 해당 캠페인의 payments.confirmed (크레딧 예치)
 * 크리에이터 정산(payouts)과 관리자 전체 목록은 포함하지 않습니다.
 */
export async function getAdvertiserDashboard(
  user: SessionUser,
): Promise<DataResult<AdvertiserDeal[]>> {
  try {
    const storedIds = typeof window !== 'undefined' ? getMyAuctionIds(user.id) : [];
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams();
        if (storedIds.length > 0) {
          params.set('ids', storedIds.join(','));
        }
        const query = params.toString();
        const response = await fetch(
          `/api/account/campaigns${query ? `?${query}` : ''}`,
          await authRequestInit({ cache: 'no-store' }),
        );
        const payload = (await response.json().catch(() => null)) as {
          data?: AdvertiserDeal[];
          error?: string;
        } | null;
        if (response.ok && Array.isArray(payload?.data) && payload.data.length > 0) {
          return payload.error ? fail(payload.data, payload.error) : ok(payload.data);
        }
      } catch (error) {
        console.warn('[SponsorAuction] 광고주 캠페인 API 조회 실패', error);
      }
    }

    const [auctionResult, extraResult] = await Promise.all([
      getAuctionsByAuthor(user.id, { extraIds: storedIds }),
      storedIds.length > 0 ? getAuctionsByIds(storedIds) : Promise.resolve(ok([] as AuctionItem[])),
    ]);
    const auctions = uniqueById([
      ...(Array.isArray(auctionResult.data) ? auctionResult.data : []),
      ...(Array.isArray(extraResult.data) ? extraResult.data : []).filter(
        (item) => !item.authorId || item.authorId === user.id,
      ),
    ]);
    const auctionIds = auctions.map((item) => item.id);
    const [bidResult, livePayments] = await Promise.all([
      getBidsByAuctionIds(auctionIds),
      loadAdvertiserPayments(auctionIds),
    ]);
    const deals = assembleAdvertiserDeals(
      auctions,
      Array.isArray(bidResult.data) ? bidResult.data : [],
      livePayments,
    );

    if (auctions.length === 0 && auctionResult.error) {
      return fail([], auctionResult.error);
    }

    return ok(deals);
  } catch (error) {
    console.error('[SponsorAuction] 광고주 대시보드 조회 예외', error);
    return fail([], '캠페인 목록을 불러오지 못했습니다.');
  }
}

/**
 * 크리에이터 영역 조회.
 * - 제안: 본인 bids만
 * - 캠페인: 그 제안에 연결된 auctions만
 * - 정산: payouts (지급 완료는 status='paid')
 * 광고주 크레딧/결제 내역과 관리자 전체 정산 목록은 포함하지 않습니다.
 */
export async function getCreatorDashboard(
  user: SessionUser,
): Promise<DataResult<CreatorDeal[]>> {
  try {
    const storedBidIds = getMyBidIds();
    const bidResult = await getBidsByCreator(user.id, {
      creatorName: user.name,
      bidIds: storedBidIds,
    });
    const bids = pickCreatorBids(Array.isArray(bidResult.data) ? bidResult.data : [], user);
    const auctionIds = [...new Set(bids.map((item) => item.auctionId).filter(Boolean))];
    const [auctionResult, rawPayouts] = await Promise.all([
      getAuctionsByIds(auctionIds),
      loadCreatorPayouts(
        user.id,
        bids.map((item) => item.id),
        auctionIds,
      ),
    ]);

    const auctions = Array.isArray(auctionResult.data) ? auctionResult.data : [];
    const auctionById = new Map(auctions.map((item) => [item.id, item]));
    const payouts = applyAdminPayoutIntegrity(rawPayouts, auctions, bids);

    const deals: CreatorDeal[] = bids.map((bid) => {
      const auction = auctionById.get(bid.auctionId) ?? null;
      const won =
        bid.status === 'selected' ||
        Boolean(auction && isBidSelected(bid, auction.winnerBidId));
      const payout = payoutForCreatorBid(payouts, bid, auction);
      const payoutStatus = payoutStatusForCreator(payout, won);
      return {
        bid: won ? { ...bid, status: 'selected' as const } : { ...bid, status: 'pending' as const },
        auction,
        payment: payout?.paymentOrderId
          ? {
              orderId: payout.paymentOrderId,
              auctionId: payout.auctionId || bid.auctionId,
              bidId: payout.bidId || bid.id,
              amount: payout.amount,
              status: payout.status === 'paid' ? 'confirmed' : payout.status,
              orderName: payout.auctionTitle,
              confirmedAt: payout.paidAt || payout.requestedAt || null,
            }
          : null,
        payout,
        payoutStatus,
      };
    });

    deals.sort((left, right) => {
      const rank = (deal: CreatorDeal) =>
        deal.payoutStatus === 'paid' ? 2 : deal.bid.status === 'selected' ? 1 : 0;
      const diff = rank(right) - rank(left);
      if (diff !== 0) {
        return diff;
      }
      return (right.bid.createdAt || '').localeCompare(left.bid.createdAt || '');
    });

    return ok(deals);
  } catch (error) {
    console.error('[SponsorAuction] 크리에이터 대시보드 조회 예외', error);
    return fail([], '제안 목록을 불러오지 못했습니다.');
  }
}
