import { creatorPayoutAmount, creatorPayoutFromCharge } from '@/lib/fees';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import type { PayoutItem, PayoutStatus } from '@/types/admin';
import type { Database } from '@/types/database';
import type { SponsorAuctionClient } from '@/lib/supabase';

export const PAYOUT_COLUMNS =
  'id, creator_id, creator_name, creator_email, amount, status, auction_title, requested_at, payment_order_id, auction_id, bid_id';

export const PAYOUT_COLUMNS_CORE =
  'id, creator_id, creator_name, creator_email, amount, status, auction_title, requested_at';

export type PayoutRow = Database['public']['Tables']['payouts']['Row'];
type PayoutInsert = Database['public']['Tables']['payouts']['Insert'];

type PaymentSeed = {
  orderId: string;
  auctionId: string;
  bidId: string;
  amount: number;
  orderName: string;
  confirmedAt: string | null;
};

function isPayoutStatus(value: string): value is PayoutStatus {
  return value === 'pending' || value === 'paid';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function mapPayout(row: Partial<PayoutRow> & Pick<PayoutRow, 'id' | 'status'>): PayoutItem | null {
  if (!isPayoutStatus(row.status)) {
    return null;
  }

  return {
    id: row.id,
    creatorId: row.creator_id ?? '',
    creatorName: row.creator_name ?? '이름 없음',
    creatorEmail: row.creator_email ?? '',
    amount: row.amount ?? 0,
    status: row.status,
    auctionTitle: row.auction_title ?? '',
    requestedAt: row.requested_at ?? '',
    paymentOrderId: row.payment_order_id ?? null,
    auctionId: row.auction_id ?? null,
    bidId: row.bid_id ?? null,
  };
}

function payoutKeys(item: {
  id?: string;
  paymentOrderId?: string | null;
  auctionId?: string | null;
  bidId?: string | null;
  auctionTitle?: string;
  creatorName?: string;
}) {
  const keys = [item.id ? `id:${item.id}` : ''].filter(Boolean);
  if (item.paymentOrderId) {
    keys.push(`order:${item.paymentOrderId}`);
  }
  if (item.auctionId && item.bidId) {
    keys.push(`deal:${item.auctionId}:${item.bidId}`);
  }
  if (item.auctionId) {
    keys.push(`auction:${item.auctionId}`);
  }
  if (item.auctionTitle && item.creatorName) {
    keys.push(`title:${item.auctionTitle}:${item.creatorName}`);
  }
  return keys;
}

export function mergePayoutLists(...lists: PayoutItem[][]) {
  const seen = new Set<string>();
  const merged: PayoutItem[] = [];

  for (const list of lists) {
    for (const item of list) {
      const keys = payoutKeys(item);
      if (keys.some((key) => seen.has(key))) {
        continue;
      }
      keys.forEach((key) => seen.add(key));
      merged.push(item);
    }
  }

  return merged.sort((left, right) => {
    return Date.parse(right.requestedAt) - Date.parse(left.requestedAt);
  });
}

async function selectPayouts(client: SponsorAuctionClient): Promise<PayoutItem[]> {
  const full = await client
    .from('payouts')
    .select(PAYOUT_COLUMNS)
    .order('requested_at', { ascending: false });

  if (!full.error) {
    return (full.data ?? [])
      .map((row) => mapPayout(row as PayoutRow))
      .filter((item): item is PayoutItem => item !== null);
  }

  if (!isSchemaMismatch(full.error)) {
    const core = await client
      .from('payouts')
      .select(PAYOUT_COLUMNS_CORE)
      .order('requested_at', { ascending: false });
    if (core.error) {
      throw core.error;
    }
    return (core.data ?? [])
      .map((row) => mapPayout(row as PayoutRow))
      .filter((item): item is PayoutItem => item !== null);
  }

  throw full.error;
}

async function loadPaymentSeeds(client: SponsorAuctionClient): Promise<PaymentSeed[]> {
  const { data, error } = await client
    .from('payments')
    .select('order_id, auction_id, bid_id, amount, order_name, status, confirmed_at, created_at')
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false });

  if (error) {
    if (!isSchemaMismatch(error)) {
      console.error('[SponsorAuction] 정산용 결제 목록 조회 실패:', error.message, error);
    }
    return [];
  }

  return (data ?? [])
    .map((row) => {
      const orderId = typeof row.order_id === 'string' ? row.order_id.trim() : '';
      const auctionId = typeof row.auction_id === 'string' ? row.auction_id.trim() : '';
      if (!orderId || !auctionId) {
        return null;
      }
      return {
        orderId,
        auctionId,
        bidId: typeof row.bid_id === 'string' ? row.bid_id.trim() : '',
        amount: Number(row.amount) || 0,
        orderName: typeof row.order_name === 'string' ? row.order_name : '',
        confirmedAt:
          (typeof row.confirmed_at === 'string' && row.confirmed_at) ||
          (typeof row.created_at === 'string' ? row.created_at : null),
      } satisfies PaymentSeed;
    })
    .filter((item): item is PaymentSeed => Boolean(item));
}

type BidLookup = {
  id: string;
  auction_id: string;
  creator_id: string | null;
  creator_name: string;
  bid_amount: number;
  status: string;
};

type AuctionLookup = {
  id: string;
  title: string;
  status: string;
  winner_bid_id: string | null;
  updated_at: string | null;
  created_at: string | null;
};

async function loadByIds<T extends { id: string }>(
  client: SponsorAuctionClient,
  table: 'bids' | 'auctions' | 'profiles',
  columns: string,
  ids: string[],
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return [];
  }

  const { data, error } = await client.from(table).select(columns).in('id', unique);
  if (error) {
    console.error(`[SponsorAuction] 정산 ${table} 조회 실패:`, error.message, error);
    return [];
  }

  return (data ?? []) as unknown as T[];
}

function buildInsert(input: {
  orderId?: string;
  auctionId: string;
  bidId: string;
  auctionTitle: string;
  creatorId: string | null;
  creatorName: string;
  creatorEmail: string;
  amount: number;
  requestedAt: string;
}): PayoutInsert | null {
  if (!input.auctionTitle.trim() || input.amount <= 0) {
    return null;
  }

  return {
    creator_id: input.creatorId && isUuid(input.creatorId) ? input.creatorId : null,
    creator_name: input.creatorName.trim() || '이름 없음',
    creator_email: input.creatorEmail.trim(),
    amount: input.amount,
    status: 'pending',
    auction_title: input.auctionTitle.trim(),
    requested_at: input.requestedAt || new Date().toISOString(),
    payment_order_id: input.orderId?.trim() || null,
    auction_id: input.auctionId || null,
    bid_id: input.bidId || null,
  };
}

function virtualFromInsert(row: PayoutInsert, fallbackId: string): PayoutItem | null {
  const mapped = mapPayout({
    id: fallbackId,
    creator_id: row.creator_id ?? null,
    creator_name: row.creator_name,
    creator_email: row.creator_email ?? '',
    amount: row.amount,
    status: row.status ?? 'pending',
    auction_title: row.auction_title ?? '',
    requested_at: row.requested_at ?? new Date().toISOString(),
    payment_order_id: row.payment_order_id ?? null,
    auction_id: row.auction_id ?? null,
    bid_id: row.bid_id ?? null,
  });
  return mapped;
}

export async function upsertPaidPayout(
  client: SponsorAuctionClient,
  input: {
    orderId: string;
    auctionId: string;
    bidId: string;
    chargeAmount?: number;
    orderName?: string;
  },
) {
  try {
    const [bids, auctions] = await Promise.all([
      loadByIds<BidLookup>(
        client,
        'bids',
        'id, auction_id, creator_id, creator_name, bid_amount, status',
        [input.bidId],
      ),
      loadByIds<AuctionLookup>(
        client,
        'auctions',
        'id, title, status, winner_bid_id, updated_at, created_at',
        [input.auctionId],
      ),
    ]);
    const bid = bids[0];
    const auction = auctions[0];
    const profiles = bid?.creator_id
      ? await loadByIds<{ id: string; name: string; email: string }>(
          client,
          'profiles',
          'id, name, email',
          [bid.creator_id],
        )
      : [];
    const profile = profiles[0];
    const amount =
      bid && bid.bid_amount > 0
        ? creatorPayoutAmount(bid.bid_amount)
        : creatorPayoutFromCharge(input.chargeAmount ?? 0);
    const insert = buildInsert({
      orderId: input.orderId,
      auctionId: input.auctionId,
      bidId: input.bidId,
      auctionTitle: auction?.title || input.orderName || '캠페인',
      creatorId: bid?.creator_id ?? null,
      creatorName: profile?.name || bid?.creator_name || '이름 없음',
      creatorEmail: profile?.email || '',
      amount,
      requestedAt: auction?.updated_at || auction?.created_at || new Date().toISOString(),
    });
    if (!insert) {
      return;
    }

    const upsert = await client.from('payouts').upsert(insert, {
      onConflict: 'payment_order_id',
      ignoreDuplicates: true,
    });
    if (upsert.error && !isSchemaMismatch(upsert.error)) {
      const fallback = await client.from('payouts').insert({
        creator_id: insert.creator_id,
        creator_name: insert.creator_name,
        creator_email: insert.creator_email,
        amount: insert.amount,
        status: 'pending',
        auction_title: insert.auction_title,
        requested_at: insert.requested_at,
      });
      if (fallback.error) {
        console.error('[SponsorAuction] 결제 후 payouts 생성 실패', fallback.error);
      }
    } else if (upsert.error) {
      console.error('[SponsorAuction] 결제 후 payouts 생성 실패', upsert.error);
    } else {
      console.info('[SponsorAuction] 결제 후 payouts 반영', {
        orderId: input.orderId,
        auctionId: input.auctionId,
        bidId: input.bidId,
      });
    }
  } catch (error) {
    console.error('[SponsorAuction] 결제 후 payouts 생성 예외', error);
  }
}

export async function listPayoutsFromDatabase(
  client: SponsorAuctionClient,
): Promise<PayoutItem[]> {
  const existing = await selectPayouts(client);
  const payments = await loadPaymentSeeds(client);
  const auctionIds = [
    ...payments.map((item) => item.auctionId),
    ...existing.map((item) => item.auctionId).filter((id): id is string => Boolean(id)),
  ];
  const bidIds = [
    ...payments.map((item) => item.bidId),
    ...existing.map((item) => item.bidId).filter((id): id is string => Boolean(id)),
  ];

  const completed = await client
    .from('auctions')
    .select('id, title, status, winner_bid_id, updated_at, created_at')
    .eq('status', 'completed');

  const completedAuctions = (completed.error ? [] : completed.data ?? []) as AuctionLookup[];
  completedAuctions.forEach((auction) => {
    auctionIds.push(auction.id);
    if (auction.winner_bid_id) {
      bidIds.push(auction.winner_bid_id);
    }
  });

  const [bids, auctions, extraBids] = await Promise.all([
    loadByIds<BidLookup>(
      client,
      'bids',
      'id, auction_id, creator_id, creator_name, bid_amount, status',
      bidIds,
    ),
    loadByIds<AuctionLookup>(
      client,
      'auctions',
      'id, title, status, winner_bid_id, updated_at, created_at',
      auctionIds,
    ),
    loadByIds<BidLookup>(
      client,
      'bids',
      'id, auction_id, creator_id, creator_name, bid_amount, status',
      completedAuctions.map((item) => item.winner_bid_id ?? ''),
    ),
  ]);

  const bidMap = new Map([...bids, ...extraBids].map((item) => [item.id, item]));
  const auctionMap = new Map(
    [...auctions, ...completedAuctions].map((item) => [item.id, item]),
  );
  const creatorIds = [...bidMap.values()]
    .map((item) => item.creator_id)
    .filter((id): id is string => Boolean(id));
  const profiles = await loadByIds<{ id: string; name: string; email: string }>(
    client,
    'profiles',
    'id, name, email',
    creatorIds,
  );
  const profileMap = new Map(profiles.map((item) => [item.id, item]));

  const pendingInserts: PayoutInsert[] = [];
  const virtual: PayoutItem[] = [];
  const seen = new Set(existing.flatMap((row) => payoutKeys(row)));

  const consider = (insert: PayoutInsert | null, fallbackId: string) => {
    if (!insert) {
      return;
    }
    const item = virtualFromInsert(insert, fallbackId);
    if (!item) {
      return;
    }
    const keys = [...payoutKeys(item), `id:${fallbackId}`];
    if (keys.some((key) => seen.has(key))) {
      return;
    }
    keys.forEach((key) => seen.add(key));
    pendingInserts.push(insert);
    virtual.push(item);
  };

  for (const payment of payments) {
    const bid = bidMap.get(payment.bidId);
    const auction = auctionMap.get(payment.auctionId);
    const profile = bid?.creator_id ? profileMap.get(bid.creator_id) : undefined;
    const amount =
      bid && bid.bid_amount > 0
        ? creatorPayoutAmount(bid.bid_amount)
        : creatorPayoutFromCharge(payment.amount);
    consider(
      buildInsert({
        orderId: payment.orderId,
        auctionId: payment.auctionId,
        bidId: payment.bidId,
        auctionTitle: auction?.title || payment.orderName || '캠페인',
        creatorId: bid?.creator_id ?? null,
        creatorName: profile?.name || bid?.creator_name || '이름 없음',
        creatorEmail: profile?.email || '',
        amount,
        requestedAt: payment.confirmedAt || auction?.updated_at || new Date().toISOString(),
      }),
      payment.orderId,
    );
  }

  for (const auction of completedAuctions) {
    const bid =
      (auction.winner_bid_id ? bidMap.get(auction.winner_bid_id) : undefined) ??
      [...bidMap.values()].find(
        (item) => item.auction_id === auction.id && item.status === 'selected',
      );
    if (!bid) {
      continue;
    }
    const profile = bid.creator_id ? profileMap.get(bid.creator_id) : undefined;
    consider(
      buildInsert({
        auctionId: auction.id,
        bidId: bid.id,
        auctionTitle: auction.title,
        creatorId: bid.creator_id,
        creatorName: profile?.name || bid.creator_name,
        creatorEmail: profile?.email || '',
        amount: creatorPayoutAmount(bid.bid_amount),
        requestedAt: auction.updated_at || auction.created_at || new Date().toISOString(),
      }),
      `auction:${auction.id}`,
    );
  }

  if (pendingInserts.length > 0) {
    const withOrder = pendingInserts.filter((row) => row.payment_order_id);
    const withoutOrder = pendingInserts.filter((row) => !row.payment_order_id);
    if (withOrder.length > 0) {
      const upserted = await client.from('payouts').upsert(withOrder, {
        onConflict: 'payment_order_id',
        ignoreDuplicates: true,
      });
      if (upserted.error) {
        console.warn('[SponsorAuction] 정산 자동 생성(upsert) 실패', upserted.error.message);
      }
    }
    if (withoutOrder.length > 0) {
      const inserted = await client.from('payouts').insert(withoutOrder);
      if (inserted.error) {
        console.warn('[SponsorAuction] 정산 자동 생성(insert) 실패', inserted.error.message);
      }
    }

    try {
      return mergePayoutLists(await selectPayouts(client), virtual);
    } catch {
      return mergePayoutLists(existing, virtual);
    }
  }

  return mergePayoutLists(existing, virtual);
}
