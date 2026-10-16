import {
  advertiserPayableAmount,
  bidAmountFromCreatorPayout,
  creatorPayoutAmount,
  creatorPayoutFromCharge,
  platformFeeFromAmount,
} from '@/lib/fees';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import type { PayoutItem, PayoutStatus } from '@/types/admin';
import type { Database } from '@/types/database';
import type { SponsorAuctionClient } from '@/lib/supabase';

export const PAYOUT_COLUMNS =
  'id, creator_id, creator_name, creator_email, amount, status, auction_title, requested_at, paid_at, payment_order_id, auction_id, bid_id, admin_memo, bank_account';

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

function isEphemeralPayoutId(value: string) {
  return /^payout-\d{10,}$/.test(value);
}

export function stablePayoutOrderId(input: {
  paymentOrderId?: string | null;
  auctionId?: string | null;
  bidId?: string | null;
  fallbackId?: string | null;
}) {
  const order = (input.paymentOrderId || '').trim();
  if (order && !isEphemeralPayoutId(order)) {
    return order;
  }
  const auctionId = (input.auctionId || '').replace(/^auction:/, '').trim();
  const bidId = (input.bidId || '').trim();
  if (auctionId && bidId) {
    return `payout-${auctionId}-${bidId}`;
  }
  if (auctionId) {
    return `payout-auction-${auctionId}`;
  }
  if (bidId) {
    return `payout-bid-${bidId}`;
  }
  const fallback = (input.fallbackId || '').replace(/^auction:/, '').trim();
  if (fallback && !isUuid(fallback) && !isEphemeralPayoutId(fallback)) {
    return fallback;
  }
  return order || fallback;
}

export function mapPayout(row: Partial<PayoutRow> & Pick<PayoutRow, 'id' | 'status'>): PayoutItem | null {
  if (!isPayoutStatus(row.status)) {
    return null;
  }

  const amount = row.amount ?? 0;
  const bidAmount = bidAmountFromCreatorPayout(amount);
  const paymentOrderId = stablePayoutOrderId({
    paymentOrderId: row.payment_order_id,
    auctionId: row.auction_id,
    bidId: row.bid_id,
    fallbackId: row.id,
  });
  return {
    id: paymentOrderId || row.id,
    creatorId: row.creator_id ?? '',
    creatorName: row.creator_name ?? '이름 없음',
    creatorEmail: row.creator_email ?? '',
    amount,
    status: row.status,
    auctionTitle: row.auction_title ?? '',
    requestedAt: row.requested_at ?? '',
    paidAt: row.paid_at ?? null,
    paymentOrderId: paymentOrderId || null,
    auctionId: row.auction_id ?? null,
    bidId: row.bid_id ?? null,
    bidAmount,
    platformFee: platformFeeFromAmount(bidAmount),
    advertiserCharge: advertiserPayableAmount(bidAmount),
    adminMemo: row.admin_memo ?? '',
    bankAccount: row.bank_account ?? '',
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

export function payoutsMatch(left: PayoutItem, right: PayoutItem) {
  if (left.id && right.id && left.id === right.id) {
    return true;
  }
  if (left.paymentOrderId && right.paymentOrderId && left.paymentOrderId === right.paymentOrderId) {
    return true;
  }
  if (left.auctionId && left.bidId && right.auctionId === left.auctionId && right.bidId === left.bidId) {
    return true;
  }
  return false;
}

export function applyPaidPayoutLocal(list: PayoutItem[], paid: PayoutItem): PayoutItem[] {
  const nextPaid: PayoutItem = {
    ...paid,
    status: 'paid',
    paidAt: paid.paidAt || new Date().toISOString(),
  };
  let matched = false;
  const next = list.map((item) => {
    if (!payoutsMatch(item, nextPaid)) {
      return item;
    }
    matched = true;
    return { ...item, ...nextPaid, id: item.id, status: 'paid' as const };
  });
  if (!matched) {
    next.unshift(nextPaid);
  }
  return next;
}

export function mergePayoutLists(...lists: PayoutItem[][]) {
  const byKey = new Map<string, PayoutItem>();
  const merged: PayoutItem[] = [];

  const rememberKeys = (item: PayoutItem) => {
    payoutKeys(item).forEach((key) => byKey.set(key, item));
  };

  for (const list of lists) {
    for (const item of list) {
      const keys = payoutKeys(item);
      const existing = keys.map((key) => byKey.get(key)).find(Boolean);
      if (!existing) {
        rememberKeys(item);
        merged.push(item);
        continue;
      }
      if (existing.status === 'paid' && item.status !== 'paid') {
        continue;
      }
      if (item.status === 'paid' && existing.status !== 'paid') {
        const index = merged.findIndex((row) => row === existing);
        const replaced = { ...existing, ...item, id: existing.id, status: 'paid' as const };
        if (index >= 0) {
          merged[index] = replaced;
        }
        rememberKeys(replaced);
        continue;
      }
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

  const legacy = await client
    .from('payouts')
    .select(
      'id, creator_id, creator_name, creator_email, amount, status, auction_title, requested_at, paid_at, payment_order_id, auction_id, bid_id',
    )
    .order('requested_at', { ascending: false });
  if (!legacy.error) {
    return (legacy.data ?? [])
      .map((row) => mapPayout(row as PayoutRow))
      .filter((item): item is PayoutItem => item !== null);
  }

  if (!isSchemaMismatch(full.error) || isSchemaMismatch(legacy.error)) {
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
    payment_order_id: stablePayoutOrderId({
      paymentOrderId: input.orderId,
      auctionId: input.auctionId,
      bidId: input.bidId,
    }) || null,
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
    paid_at: row.paid_at ?? null,
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

export function overlayDbPayoutStatus(dbRows: PayoutItem[], list: PayoutItem[]): PayoutItem[] {
  const merged = mergePayoutLists(dbRows, list);
  return merged.map((item) => {
    const db = dbRows.find(
      (row) =>
        (row.paymentOrderId &&
          item.paymentOrderId &&
          row.paymentOrderId === item.paymentOrderId) ||
        payoutsMatch(row, item) ||
        (row.auctionId && item.auctionId && row.auctionId === item.auctionId),
    );
    if (!db) {
      return item;
    }
    const paymentOrderId = stablePayoutOrderId({
      paymentOrderId: db.paymentOrderId || item.paymentOrderId,
      auctionId: db.auctionId || item.auctionId,
      bidId: db.bidId || item.bidId,
      fallbackId: db.id || item.id,
    });
    const status: PayoutStatus = db.status === 'paid' ? 'paid' : db.status;
    return {
      ...item,
      ...db,
      id: paymentOrderId || db.id || item.id,
      paymentOrderId: paymentOrderId || null,
      status,
      paidAt: status === 'paid' ? db.paidAt : item.paidAt,
    };
  });
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
  const paidExisting = existing.filter((row) => row.status === 'paid');

  const matchesPaid = (item: PayoutItem) =>
    paidExisting.some(
      (row) =>
        payoutsMatch(row, item) ||
        (row.paymentOrderId &&
          item.paymentOrderId &&
          row.paymentOrderId === item.paymentOrderId) ||
        (row.auctionId && item.auctionId && row.auctionId === item.auctionId),
    );

  const consider = (insert: PayoutInsert | null, fallbackId: string) => {
    if (!insert) {
      return;
    }
    const stableId = insert.payment_order_id || fallbackId;
    const item = virtualFromInsert(insert, stableId);
    if (!item) {
      return;
    }
    const keys = [...payoutKeys(item), `id:${fallbackId}`, `id:${stableId}`, `order:${stableId}`];
    if (keys.some((key) => seen.has(key)) || matchesPaid(item)) {
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
      const latest = await selectPayouts(client);
      return overlayDbPayoutStatus(latest, mergePayoutLists(latest, virtual));
    } catch {
      return overlayDbPayoutStatus(existing, mergePayoutLists(existing, virtual));
    }
  }

  return overlayDbPayoutStatus(existing, mergePayoutLists(existing, virtual));
}

export type MarkPayoutPaidInput = {
  id?: string;
  paymentOrderId?: string | null;
  auctionId?: string | null;
  bidId?: string | null;
  amount?: number;
  auctionTitle?: string;
  creatorName?: string;
  creatorEmail?: string;
  creatorId?: string;
};

function formatSupabaseError(error: { message?: string; code?: string; details?: string; hint?: string }) {
  return [error.message, error.code && `[${error.code}]`, error.details, error.hint]
    .filter(Boolean)
    .join(' ');
}

function isSkippableWriteError(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }
  return (
    error.code === '22P02' ||
    error.code === 'PGRST116' ||
    /invalid input syntax for type uuid/i.test(error.message ?? '') ||
    /cannot coerce the result to a single json object/i.test(error.message ?? '') ||
    /0 rows/i.test(error.message ?? '')
  );
}

async function fetchConfirmedPayment(
  client: SponsorAuctionClient,
  orderId: string,
  auctionId: string,
) {
  const columns =
    'order_id, auction_id, bid_id, amount, order_name, status, confirmed_at, created_at';
  if (orderId) {
    const byOrder = await client.from('payments').select(columns).eq('order_id', orderId).limit(1);
    if (byOrder.data?.[0]) {
      return byOrder.data[0];
    }
  }
  if (auctionId) {
    const byAuction = await client
      .from('payments')
      .select(columns)
      .eq('auction_id', auctionId)
      .eq('status', 'confirmed')
      .limit(1);
    if (byAuction.data?.[0]) {
      return byAuction.data[0];
    }
  }
  return null;
}

async function fetchSelectedBid(
  client: SponsorAuctionClient,
  auctionId: string,
): Promise<BidLookup | undefined> {
  if (!auctionId) {
    return undefined;
  }
  const { data } = await client
    .from('bids')
    .select('id, auction_id, creator_id, creator_name, bid_amount, status')
    .eq('auction_id', auctionId)
    .eq('status', 'selected')
    .limit(1);
  return (data?.[0] as BidLookup | undefined) ?? undefined;
}

function mapWriteResult(data: unknown) {
  if (!data || typeof data !== 'object') {
    return null;
  }
  return mapPayout(data as PayoutRow);
}

async function persistPaidPayout(
  client: SponsorAuctionClient,
  row: PayoutInsert,
  rawId: string,
): Promise<{ ok: true; data: PayoutItem } | { ok: false; message: string }> {
  const errors: string[] = [];
  const paidPatch = {
    status: 'paid' as const,
    paid_at: row.paid_at,
    amount: row.amount,
    creator_id: row.creator_id,
    creator_name: row.creator_name,
    creator_email: row.creator_email,
    auction_title: row.auction_title,
    requested_at: row.requested_at,
    payment_order_id: row.payment_order_id,
    auction_id: row.auction_id,
    bid_id: row.bid_id,
  };

  const upsert = await client
    .from('payouts')
    .upsert(row, { onConflict: 'payment_order_id' })
    .select(PAYOUT_COLUMNS)
    .maybeSingle();
  const upserted = mapWriteResult(upsert.data);
  if (upserted) {
    return { ok: true, data: upserted };
  }
  if (upsert.error) {
    errors.push(`upsert: ${formatSupabaseError(upsert.error)}`);
  }

  const inserted = await client.from('payouts').insert(row).select(PAYOUT_COLUMNS).maybeSingle();
  const insertedMapped = mapWriteResult(inserted.data);
  if (insertedMapped) {
    return { ok: true, data: insertedMapped };
  }
  if (inserted.error) {
    errors.push(`insert: ${formatSupabaseError(inserted.error)}`);
  }

  if (row.payment_order_id) {
    const byOrder = await client
      .from('payouts')
      .update(paidPatch)
      .eq('payment_order_id', row.payment_order_id)
      .select(PAYOUT_COLUMNS)
      .maybeSingle();
    const mapped = mapWriteResult(byOrder.data);
    if (mapped) {
      return { ok: true, data: mapped };
    }
    if (byOrder.error && !isSkippableWriteError(byOrder.error)) {
      errors.push(`update(order): ${formatSupabaseError(byOrder.error)}`);
    }
  }

  if (rawId && isUuid(rawId)) {
    const byId = await client
      .from('payouts')
      .update(paidPatch)
      .eq('id', rawId)
      .select(PAYOUT_COLUMNS)
      .maybeSingle();
    const mapped = mapWriteResult(byId.data);
    if (mapped) {
      return { ok: true, data: mapped };
    }
    if (byId.error && !isSkippableWriteError(byId.error)) {
      errors.push(`update(id): ${formatSupabaseError(byId.error)}`);
    }
  }

  const core = {
    creator_id: row.creator_id,
    creator_name: row.creator_name,
    creator_email: row.creator_email,
    amount: row.amount,
    status: 'paid' as const,
    auction_title: row.auction_title,
    requested_at: row.requested_at,
  };
  const coreInsert = await client.from('payouts').insert(core).select(PAYOUT_COLUMNS_CORE).maybeSingle();
  const coreMapped = mapWriteResult({
    ...(coreInsert.data as object | null),
    paid_at: row.paid_at,
    payment_order_id: row.payment_order_id,
    auction_id: row.auction_id,
    bid_id: row.bid_id,
  });
  if (coreInsert.data && coreMapped) {
    return { ok: true, data: coreMapped };
  }
  if (coreInsert.error) {
    errors.push(`insert(core): ${formatSupabaseError(coreInsert.error)}`);
  }

  if (rawId && isUuid(rawId)) {
    const coreUpdate = await client
      .from('payouts')
      .update({ status: 'paid' })
      .eq('id', rawId)
      .select(PAYOUT_COLUMNS_CORE)
      .maybeSingle();
    const mapped = mapWriteResult({
      ...(coreUpdate.data as object | null),
      paid_at: row.paid_at,
    });
    if (coreUpdate.data && mapped) {
      return { ok: true, data: mapped };
    }
    if (coreUpdate.error && !isSkippableWriteError(coreUpdate.error)) {
      errors.push(`update(core): ${formatSupabaseError(coreUpdate.error)}`);
    }
  }

  return {
    ok: false,
    message: errors.filter(Boolean).join(' | ') || 'payouts UPSERT/INSERT가 빈 결과를 반환했습니다.',
  };
}

export async function markPayoutPaid(
  client: SponsorAuctionClient,
  input: MarkPayoutPaidInput,
): Promise<{ ok: true; data: PayoutItem } | { ok: false; message: string }> {
  const paidAt = new Date().toISOString();
  const rawId = (input.id || '').trim();
  let orderId = (input.paymentOrderId || '').trim();
  let auctionId = (input.auctionId || '').trim();
  let bidId = (input.bidId || '').trim();

  if (rawId.startsWith('auction:') && !auctionId) {
    auctionId = rawId.slice('auction:'.length);
  }
  if (rawId && !orderId && !isUuid(rawId) && !rawId.startsWith('auction:')) {
    orderId = rawId;
  }

  const payment = await fetchConfirmedPayment(client, orderId, auctionId);
  if (payment) {
    orderId = String(payment.order_id || orderId);
    auctionId = String(payment.auction_id || auctionId);
    bidId = String(payment.bid_id || bidId);
  }

  const [auctions, bids] = await Promise.all([
    auctionId
      ? loadByIds<AuctionLookup>(
          client,
          'auctions',
          'id, title, status, winner_bid_id, updated_at, created_at',
          [auctionId],
        )
      : Promise.resolve([]),
    bidId
      ? loadByIds<BidLookup>(
          client,
          'bids',
          'id, auction_id, creator_id, creator_name, bid_amount, status',
          [bidId],
        )
      : Promise.resolve([]),
  ]);

  const auction = auctions[0];
  let bid: BidLookup | undefined = bids[0];
  if (!bid && auction?.winner_bid_id) {
    const winners = await loadByIds<BidLookup>(
      client,
      'bids',
      'id, auction_id, creator_id, creator_name, bid_amount, status',
      [auction.winner_bid_id],
    );
    bid = winners[0];
    bidId = bid?.id || bidId;
  }
  if (!bid && auctionId) {
    bid = await fetchSelectedBid(client, auctionId);
    bidId = bid?.id || bidId;
  }

  const creatorIdRaw = bid?.creator_id || input.creatorId || '';
  const profiles = creatorIdRaw
    ? await loadByIds<{ id: string; name: string; email: string }>(
        client,
        'profiles',
        'id, name, email',
        [creatorIdRaw],
      )
    : [];
  const profile = profiles[0];

  const amountFromBid = bid && bid.bid_amount > 0 ? creatorPayoutAmount(bid.bid_amount) : 0;
  const amountFromPayment = payment?.amount ? creatorPayoutFromCharge(Number(payment.amount)) : 0;
  const amount = Math.round(
    amountFromBid ||
      amountFromPayment ||
      (input.amount && input.amount > 0 ? input.amount : 0),
  );

  if (amount <= 0) {
    return {
      ok: false,
      message: '지급 금액이 없어 정산 행을 만들 수 없습니다. payments.amount 또는 bids.bid_amount를 확인하세요.',
    };
  }

  const paymentOrderId = stablePayoutOrderId({
    paymentOrderId: orderId,
    auctionId,
    bidId,
    fallbackId: rawId,
  });
  if (!paymentOrderId) {
    return {
      ok: false,
      message: '정산 식별자(payment_order_id)를 만들 수 없습니다. auction_id 또는 결제 order_id를 확인하세요.',
    };
  }

  const row: PayoutInsert = {
    creator_id: profile && isUuid(creatorIdRaw) ? creatorIdRaw : null,
    creator_name: (profile?.name || bid?.creator_name || input.creatorName || '이름 없음').trim(),
    creator_email: (profile?.email || input.creatorEmail || '').trim(),
    amount,
    status: 'paid',
    auction_title: (auction?.title || String(payment?.order_name || '') || input.auctionTitle || '캠페인').trim(),
    requested_at:
      (typeof payment?.confirmed_at === 'string' && payment.confirmed_at) ||
      (typeof payment?.created_at === 'string' && payment.created_at) ||
      paidAt,
    paid_at: paidAt,
    payment_order_id: paymentOrderId,
    auction_id: auctionId || null,
    bid_id: bidId || null,
  };

  const persisted = await persistPaidPayout(client, row, rawId);
  if (!persisted.ok) {
    console.error('[SponsorAuction] 정산 지급 저장 실패', {
      message: persisted.message,
      paymentOrderId,
      auctionId,
      bidId,
      amount,
    });
    return persisted;
  }

  if (paymentOrderId) {
    const paymentSync = await client
      .from('payments')
      .update({ status: 'confirmed' })
      .eq('order_id', paymentOrderId)
      .neq('status', 'confirmed');
    if (paymentSync.error && !isSchemaMismatch(paymentSync.error)) {
      console.warn('[SponsorAuction] payments 상태 동기화 실패', paymentSync.error.message);
    }
  }

  return persisted;
}

export async function updatePayoutMemo(
  client: SponsorAuctionClient,
  input: MarkPayoutPaidInput & { adminMemo: string },
): Promise<{ ok: true; data: PayoutItem } | { ok: false; message: string }> {
  const memo = (input.adminMemo || '').trim();
  const orderId = stablePayoutOrderId({
    paymentOrderId: input.paymentOrderId,
    auctionId: input.auctionId,
    bidId: input.bidId,
    fallbackId: input.id,
  });
  const errors: string[] = [];

  const attempts: Array<{ column: 'payment_order_id' | 'auction_id' | 'bid_id' | 'id'; value: string }> = [];
  if (orderId) {
    attempts.push({ column: 'payment_order_id', value: orderId });
  }
  if (input.auctionId) {
    attempts.push({ column: 'auction_id', value: input.auctionId });
  }
  if (input.bidId) {
    attempts.push({ column: 'bid_id', value: input.bidId });
  }
  if (input.id && isUuid(input.id)) {
    attempts.push({ column: 'id', value: input.id });
  }

  for (const attempt of attempts) {
    const result = await client
      .from('payouts')
      .update({ admin_memo: memo })
      .eq(attempt.column, attempt.value)
      .select(PAYOUT_COLUMNS)
      .maybeSingle();
    if (result.error && isSchemaMismatch(result.error)) {
      return { ok: false, message: 'payouts.admin_memo 컬럼이 없습니다. schema.sql을 적용해 주세요.' };
    }
    if (result.error && !isSkippableWriteError(result.error)) {
      errors.push(formatSupabaseError(result.error));
      continue;
    }
    const mapped = mapWriteResult(result.data);
    if (mapped) {
      return { ok: true, data: { ...mapped, adminMemo: memo } };
    }
  }

  return {
    ok: false,
    message: errors.filter(Boolean).join(' | ') || '정산 메모를 저장할 행을 찾지 못했습니다.',
  };
}
