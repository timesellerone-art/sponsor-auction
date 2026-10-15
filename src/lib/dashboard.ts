import { getAuctions, getBids, getBidsByCreator } from '@/lib/auctions';
import { advertiserPayableAmount } from '@/lib/fees';
import { getMyAuctionIds, getStoredAuctionIds } from '@/lib/my-campaigns';
import { getMyBidIds } from '@/lib/my-bids';
import { getDataClient } from '@/lib/supabase/data-client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import {
  isAuctionClosed,
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
        amount: advertiserPayableAmount(bid.bidAmount),
        status: 'confirmed',
        orderName: auction.title,
        confirmedAt: auction.createdAt || null,
      } satisfies PaymentRecord;
    })
    .filter((item): item is PaymentRecord => Boolean(item));
}

async function loadConfirmedPayments(): Promise<PaymentRecord[]> {
  const supabase = await getDataClient();
  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('payments')
      .select(PAYMENT_COLUMNS)
      .eq('status', 'confirmed')
      .order('confirmed_at', { ascending: false });

    if (error) {
      if (!isSchemaMismatch(error)) {
        console.error('[SponsorAuction] 결제 목록 조회 실패:', error.message, error);
      }
      return [];
    }

    return (data ?? [])
      .map((row) => mapPayment(row))
      .filter((item): item is PaymentRecord => Boolean(item));
  } catch (error) {
    console.error('[SponsorAuction] 결제 목록 조회 예외', error);
    return [];
  }
}

function displayAuction(auction: AuctionItem, paid: boolean): AuctionItem {
  if (paid && auction.status !== 'completed') {
    return { ...auction, status: 'completed' };
  }
  return auction;
}

function pickAdvertiserAuctions(all: AuctionItem[], user: SessionUser, mockMode: boolean) {
  const byAuthorId = all.filter((item) => item.authorId && item.authorId === user.id);
  if (byAuthorId.length > 0) {
    return uniqueById(byAuthorId);
  }

  const byName = all.filter((item) => item.authorName && item.authorName === user.name);
  const stored = new Set(mockMode ? getMyAuctionIds() : getStoredAuctionIds());
  const byStored = all.filter((item) => stored.has(item.id));
  return uniqueById([...byName, ...byStored]);
}

function pickCreatorBids(all: BidItem[], user: SessionUser) {
  const mine = new Set(getMyBidIds());
  return all.filter(
    (bid) =>
      (bid.creatorId && bid.creatorId === user.id) ||
      (bid.creatorName && bid.creatorName === user.name) ||
      mine.has(bid.id),
  );
}

export async function getAdvertiserDashboard(
  user: SessionUser,
): Promise<DataResult<AdvertiserDeal[]>> {
  try {
    const [auctionResult, bidResult, livePayments] = await Promise.all([
      getAuctions(),
      getBids(),
      loadConfirmedPayments(),
    ]);

    const auctions = Array.isArray(auctionResult.data) ? auctionResult.data : [];
    const bids = Array.isArray(bidResult.data) ? bidResult.data : [];
    const mockMode = !(await getDataClient());
    const mine = pickAdvertiserAuctions(auctions, user, mockMode);
    const payments = livePayments.length > 0 ? livePayments : mockPaymentsFromDeals(mine, bids);
    const paymentByAuction = new Map(payments.map((item) => [item.auctionId, item]));

    const deals: AdvertiserDeal[] = mine.map((auction) => {
      const auctionBids = bids.filter((item) => item.auctionId === auction.id);
      const payment = paymentByAuction.get(auction.id) ?? null;
      const bid =
        auctionBids.find((item) => item.id === payment?.bidId) ??
        auctionBids.find((item) => isBidSelected(item, auction.winnerBidId)) ??
        null;
      const paid = payment?.status === 'confirmed' || auction.status === 'completed';
      return {
        auction: displayAuction(auction, paid),
        bid,
        bids: auctionBids,
        payment: payment?.status === 'confirmed' ? payment : null,
      };
    });

    deals.sort((left, right) => {
      const leftPaid = left.auction.status === 'completed' ? 1 : 0;
      const rightPaid = right.auction.status === 'completed' ? 1 : 0;
      if (leftPaid !== rightPaid) {
        return rightPaid - leftPaid;
      }
      return (right.auction.createdAt || '').localeCompare(left.auction.createdAt || '');
    });

    return ok(deals);
  } catch (error) {
    console.error('[SponsorAuction] 광고주 대시보드 조회 예외', error);
    return fail([], '캠페인 목록을 불러오지 못했습니다.');
  }
}

export async function getCreatorDashboard(
  user: SessionUser,
): Promise<DataResult<CreatorDeal[]>> {
  try {
    const storedBidIds = getMyBidIds();
    const [auctionResult, bidResult, livePayments] = await Promise.all([
      getAuctions(),
      getBidsByCreator(user.id, {
        creatorName: user.name,
        bidIds: storedBidIds,
      }),
      loadConfirmedPayments(),
    ]);

    const auctions = Array.isArray(auctionResult.data) ? auctionResult.data : [];
    const bids = pickCreatorBids(
      Array.isArray(bidResult.data) ? bidResult.data : [],
      user,
    );
    const auctionById = new Map(auctions.map((item) => [item.id, item]));
    const payments = livePayments.length > 0 ? livePayments : mockPaymentsFromDeals(auctions, bids);
    const paymentByBid = new Map(
      payments.filter((item) => item.bidId).map((item) => [item.bidId, item]),
    );

    const deals: CreatorDeal[] = bids.map((bid) => {
      const auction = auctionById.get(bid.auctionId) ?? null;
      const paymentForThisBid = paymentByBid.get(bid.id) ?? null;
      const won =
        bid.status === 'selected' ||
        Boolean(auction && isBidSelected(bid, auction.winnerBidId));
      const paid = won && paymentForThisBid?.status === 'confirmed';
      return {
        bid: won ? { ...bid, status: 'selected' as const } : { ...bid, status: 'pending' as const },
        auction: auction ? displayAuction(auction, paid) : null,
        payment: paid ? paymentForThisBid : null,
      };
    });

    deals.sort((left, right) => {
      const leftWon = left.bid.status === 'selected' ? 1 : 0;
      const rightWon = right.bid.status === 'selected' ? 1 : 0;
      if (leftWon !== rightWon) {
        return rightWon - leftWon;
      }
      return (right.bid.createdAt || '').localeCompare(left.bid.createdAt || '');
    });

    return ok(deals);
  } catch (error) {
    console.error('[SponsorAuction] 크리에이터 대시보드 조회 예외', error);
    return fail([], '제안 목록을 불러오지 못했습니다.');
  }
}
