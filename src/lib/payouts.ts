import { applyAdminPayoutIntegrity } from '@/lib/admin-integrity';
import { settlementDueAtIso } from '@/lib/business-days';
import { creatorTaxKind } from '@/lib/business-registration';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import {
  bankAccountWithHolder,
  composeBankAccount,
  settlementAccountError,
  settlementAccountFromBankField,
  settlementAccountFromParts,
  type SettlementAccount,
} from '@/lib/settlement-account';
import { bidAmountFromAdvertiserCharge } from '@/lib/fees';
import { VALIDATION } from '@/lib/validation';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { isInvalidUuidError, isUuid, uuidIds } from '@/lib/uuid';
import type { PayoutItem, PayoutStatus } from '@/types/admin';
import type { Database } from '@/types/database';
import type { SponsorAuctionClient } from '@/lib/supabase';

export const PAYOUT_COLUMNS_BANK =
  'id, creator_id, creator_name, creator_email, amount, status, auction_title, requested_at, paid_at, payment_order_id, auction_id, bid_id, admin_memo, bank_account';

export const PAYOUT_COLUMNS =
  `${PAYOUT_COLUMNS_BANK}, bank_name, account_number, account_holder, settlement_due_at`;

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
  return value === 'pending' || value === 'paid' || value === 'hold';
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
  const decodedAccount = settlementAccountFromBankField(row.bank_account);
  const paymentOrderId = stablePayoutOrderId({
    paymentOrderId: row.payment_order_id,
    auctionId: row.auction_id,
    bidId: row.bid_id,
    fallbackId: row.id,
  });
  return {
    id: row.id,
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
    bidAmount: 0,
    adminMemo: row.admin_memo ?? '',
    bankAccount: row.bank_account ?? '',
    bankName: row.bank_name?.trim() || decodedAccount.bankName,
    accountNumber: row.account_number?.trim() || decodedAccount.accountNumber,
    accountHolder: row.account_holder?.trim() || decodedAccount.accountHolder,
    settlementDueAt:
      row.settlement_due_at ||
      ((row.status === 'pending' || row.status === 'hold') && row.requested_at
        ? settlementDueAtIso(row.requested_at, 4)
        : null),
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

export function applyHoldPayoutLocal(
  list: PayoutItem[],
  target: PayoutItem,
  hold: boolean,
): PayoutItem[] {
  const nextStatus: PayoutStatus = hold ? 'hold' : 'pending';
  return list.map((item) => {
    if (!payoutsMatch(item, target) && item.id !== target.id) {
      return item;
    }
    return {
      ...item,
      ...target,
      id: item.id,
      paymentOrderId: target.paymentOrderId || item.paymentOrderId || null,
      status: nextStatus,
    };
  });
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
      if (existing.status === 'cancelled' && item.status !== 'paid') {
        continue;
      }
      if (item.status === 'cancelled' && existing.status !== 'paid') {
        const index = merged.findIndex((row) => row === existing);
        const replaced = { ...existing, ...item, id: existing.id, status: 'cancelled' as const };
        if (index >= 0) {
          merged[index] = replaced;
        }
        rememberKeys(replaced);
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
      if (existing.status === 'hold' && item.status === 'pending') {
        continue;
      }
      if (item.status === 'hold' && existing.status !== 'paid' && existing.status !== 'cancelled') {
        const index = merged.findIndex((row) => row === existing);
        const replaced = { ...existing, ...item, id: existing.id, status: 'hold' as const };
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

  if (full.error && isSchemaMismatch(full.error)) {
    const withBank = await client
      .from('payouts')
      .select(PAYOUT_COLUMNS_BANK)
      .order('requested_at', { ascending: false });
    if (!withBank.error) {
      return (withBank.data ?? [])
        .map((row) => mapPayout(row as PayoutRow))
        .filter((item): item is PayoutItem => item !== null);
    }
  }

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

function mapPayoutRows(data: unknown[] | null | undefined): PayoutItem[] {
  return (data ?? [])
    .map((row) => mapPayout(row as PayoutRow))
    .filter((item): item is PayoutItem => item !== null);
}

async function queryPayoutsByColumn(
  client: SponsorAuctionClient,
  column: 'creator_id' | 'bid_id' | 'auction_id',
  values: string | string[],
): Promise<PayoutItem[]> {
  const apply = (select: string) => {
    const query = client.from('payouts').select(select).order('requested_at', { ascending: false });
    return Array.isArray(values) ? query.in(column, values) : query.eq(column, values);
  };

  const full = await apply(PAYOUT_COLUMNS);
  if (!full.error) {
    return mapPayoutRows(full.data);
  }
  if (isSchemaMismatch(full.error)) {
    const withBank = await apply(PAYOUT_COLUMNS_BANK);
    if (!withBank.error) {
      return mapPayoutRows(withBank.data);
    }
  }
  const core = await apply(PAYOUT_COLUMNS_CORE);
  if (!core.error) {
    return mapPayoutRows(core.data);
  }
  return [];
}

/** 크리에이터 본인 정산만 조회합니다. 관리자 전체 정산 목록과 분리합니다. */
export async function listPayoutsForCreator(
  client: SponsorAuctionClient,
  input: { creatorId: string; bidIds?: string[]; auctionIds?: string[] },
): Promise<PayoutItem[]> {
  const chunks: PayoutItem[][] = [];
  if (isUuid(input.creatorId)) {
    chunks.push(await queryPayoutsByColumn(client, 'creator_id', input.creatorId));
  }
  const bidIds = uuidIds(input.bidIds ?? []);
  if (bidIds.length > 0) {
    chunks.push(await queryPayoutsByColumn(client, 'bid_id', bidIds));
  }
  const auctionIds = uuidIds(input.auctionIds ?? []);
  if (auctionIds.length > 0) {
    chunks.push(await queryPayoutsByColumn(client, 'auction_id', auctionIds));
  }
  return mergePayoutLists(...chunks);
}

export function payoutStatusForCreator(
  payout: PayoutItem | null | undefined,
  awarded: boolean,
): 'none' | 'pending' | 'hold' | 'paid' {
  if (payout?.status === 'paid') {
    return 'paid';
  }
  if (payout?.status === 'hold') {
    return 'hold';
  }
  if (awarded || payout?.status === 'pending') {
    return 'pending';
  }
  return 'none';
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
  bank_name?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
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
  const unique = uuidIds(ids);
  if (unique.length === 0) {
    return [];
  }

  const { data, error } = await client.from(table).select(columns).in('id', unique);
  if (error) {
    if (!isInvalidUuidError(error)) {
      console.error(`[SponsorAuction] 정산 ${table} 조회 실패:`, error.message, error);
    }
    return [];
  }

  return (data ?? []) as unknown as T[];
}

const BID_LOOKUP_COLUMNS =
  'id, auction_id, creator_id, creator_name, bid_amount, status, bank_name, account_number, account_holder';
const BID_LOOKUP_CORE = 'id, auction_id, creator_id, creator_name, bid_amount, status';

async function loadBidsForPayout(client: SponsorAuctionClient, ids: string[]) {
  const full = await loadByIds<BidLookup>(client, 'bids', BID_LOOKUP_COLUMNS, ids);
  if (full.length > 0) {
    return full;
  }
  return loadByIds<BidLookup>(client, 'bids', BID_LOOKUP_CORE, ids);
}

type CreatorPayoutProfile = {
  id: string;
  name: string;
  email: string;
  bank_name?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
  settlement_type?: string | null;
  business_registration_number?: string | null;
  business_verification_status?: string | null;
};

const CREATOR_PAYOUT_PROFILE_COLUMNS =
  'id, name, email, bank_name, account_number, account_holder, settlement_type, business_registration_number, business_verification_status';

async function loadCreatorPayoutProfiles(client: SponsorAuctionClient, ids: string[]) {
  const full = await loadByIds<CreatorPayoutProfile>(
    client,
    'profiles',
    CREATOR_PAYOUT_PROFILE_COLUMNS,
    ids,
  );
  if (full.length > 0) {
    return full;
  }
  return loadByIds<CreatorPayoutProfile>(client, 'profiles', 'id, name, email', ids);
}

function payoutAccountFor(
  bid?: BidLookup | null,
  profile?: CreatorPayoutProfile | null,
): SettlementAccount {
  const fromProfile = settlementAccountFromParts({
    bankName: profile?.bank_name,
    accountNumber: profile?.account_number,
    accountHolder: profile?.account_holder,
  });
  if (!settlementAccountError(fromProfile)) {
    return fromProfile;
  }
  return settlementAccountFromParts({
    bankName: bid?.bank_name,
    accountNumber: bid?.account_number,
    accountHolder: bid?.account_holder,
  });
}

function payoutRequestAmount(
  bidAmount: number,
  chargeAmount: number,
  profile?: CreatorPayoutProfile | null,
) {
  const taxKind = creatorTaxKind({
    settlementType: profile?.settlement_type,
    businessVerificationStatus: profile?.business_verification_status,
    businessRegistrationNumber: profile?.business_registration_number,
  });
  const bid =
    bidAmount > 0
      ? bidAmount
      : chargeAmount > 0
        ? bidAmountFromAdvertiserCharge(chargeAmount)
        : 0;
  if (bid > 0) {
    return describeSettlementAmounts(bid, taxKind).transferAmount;
  }
  return 0;
}

function settlementColumns(account: SettlementAccount, requestedAt?: string) {
  return {
    bank_name: account.bankName,
    account_number: account.accountNumber,
    account_holder: account.accountHolder,
    bank_account: composeBankAccount(account),
    settlement_due_at: settlementDueAtIso(requestedAt || new Date().toISOString(), 4),
  };
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
  bid?: BidLookup | null;
  profile?: CreatorPayoutProfile | null;
}): PayoutInsert | null {
  if (!input.auctionTitle.trim() || input.amount <= 0) {
    return null;
  }
  const account = payoutAccountFor(input.bid, input.profile);
  const settlement = settlementAccountError(account)
    ? settlementColumns(
        { bankName: '', accountNumber: '', accountHolder: '' },
        input.requestedAt,
      )
    : settlementColumns(account, input.requestedAt);

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
    ...settlement,
  };
}

async function savePendingPayout(client: SponsorAuctionClient, insert: PayoutInsert) {
  const upsert = await client.from('payouts').upsert(insert, {
    onConflict: 'payment_order_id',
    ignoreDuplicates: true,
  });
  if (upsert.error && isSchemaMismatch(upsert.error)) {
    const fallback = await client.from('payouts').insert({
      creator_id: insert.creator_id,
      creator_name: insert.creator_name,
      creator_email: insert.creator_email,
      amount: insert.amount,
      status: 'pending',
      auction_title: insert.auction_title,
      requested_at: insert.requested_at,
      payment_order_id: insert.payment_order_id,
      auction_id: insert.auction_id,
      bid_id: insert.bid_id,
      bank_account: bankAccountWithHolder(
        settlementAccountFromParts({
          bankName: insert.bank_name,
          accountNumber: insert.account_number,
          accountHolder: insert.account_holder,
        }),
      ),
    });
    return fallback.error;
  }
  if (!upsert.error && insert.payment_order_id) {
    await client
      .from('payouts')
      .update({
        bank_name: insert.bank_name,
        account_number: insert.account_number,
        account_holder: insert.account_holder,
        bank_account: insert.bank_account,
        settlement_due_at: insert.settlement_due_at,
        amount: insert.amount,
      })
      .eq('payment_order_id', insert.payment_order_id)
      .eq('status', 'pending');
  }
  return upsert.error;
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
    bank_account: row.bank_account ?? '',
    bank_name: row.bank_name ?? '',
    account_number: row.account_number ?? '',
    account_holder: row.account_holder ?? '',
    settlement_due_at: row.settlement_due_at ?? null,
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
): Promise<boolean> {
  try {
    const [bids, auctions] = await Promise.all([
      loadBidsForPayout(client, [input.bidId]),
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
      ? await loadCreatorPayoutProfiles(client, [bid.creator_id])
      : [];
    const profile = profiles[0];
    const amount = payoutRequestAmount(bid?.bid_amount ?? 0, input.chargeAmount ?? 0, profile);
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
      bid,
      profile,
    });
    if (!insert) {
      return false;
    }

    const saved = await savePendingPayout(client, insert);
    if (saved) {
      console.error('[SponsorAuction] 결제 후 payouts 생성 실패', saved);
      return false;
    }
    console.info('[SponsorAuction] 결제 후 payouts 반영', {
      orderId: input.orderId,
      auctionId: input.auctionId,
      bidId: input.bidId,
      amount: insert.amount,
    });
    return true;
  } catch (error) {
    console.error('[SponsorAuction] 결제 후 payouts 생성 예외', error);
    return false;
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
      id: db.id || item.id,
      paymentOrderId: paymentOrderId || db.paymentOrderId || item.paymentOrderId || null,
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
    .not('winner_bid_id', 'is', null);

  const completedAuctions = (completed.error ? [] : completed.data ?? []).filter(
    (item) => item.status !== 'cancelled',
  ) as AuctionLookup[];
  completedAuctions.forEach((auction) => {
    auctionIds.push(auction.id);
    if (auction.winner_bid_id) {
      bidIds.push(auction.winner_bid_id);
    }
  });

  const [bids, auctions, extraBids] = await Promise.all([
    loadBidsForPayout(client, bidIds),
    loadByIds<AuctionLookup>(
      client,
      'auctions',
      'id, title, status, winner_bid_id, updated_at, created_at',
      auctionIds,
    ),
    loadBidsForPayout(client, completedAuctions.map((item) => item.winner_bid_id ?? '')),
  ]);

  const bidMap = new Map([...bids, ...extraBids].map((item) => [item.id, item]));
  const auctionMap = new Map(
    [...auctions, ...completedAuctions].map((item) => [item.id, item]),
  );
  const creatorIds = [
    ...[...bidMap.values()].map((item) => item.creator_id),
    ...existing.map((item) => item.creatorId),
  ].filter((id): id is string => Boolean(id));
  const profiles = await loadCreatorPayoutProfiles(client, creatorIds);
  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  const profileTaxRefs = profiles.map((item) => ({
    id: item.id,
    settlementType: item.settlement_type ?? undefined,
    businessRegistrationNumber: item.business_registration_number ?? '',
    businessVerificationStatus: item.business_verification_status ?? undefined,
  }));

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
    if (auction?.status === 'cancelled') {
      continue;
    }
    const profile = bid?.creator_id ? profileMap.get(bid.creator_id) : undefined;
    const amount = payoutRequestAmount(bid?.bid_amount ?? 0, payment.amount, profile);
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
        bid,
        profile,
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
        amount: payoutRequestAmount(bid.bid_amount, 0, profile),
        requestedAt: auction.updated_at || auction.created_at || new Date().toISOString(),
        bid,
        profile,
      }),
      `auction:${auction.id}`,
    );
  }

  if (pendingInserts.length > 0) {
    const withOrder = pendingInserts.filter((row) => row.payment_order_id);
    const withoutOrder = pendingInserts.filter((row) => !row.payment_order_id);
    if (withOrder.length > 0) {
      for (const row of withOrder) {
        const saved = await savePendingPayout(client, row);
        if (saved) {
          console.warn('[SponsorAuction] 정산 자동 생성(upsert) 실패', saved.message);
        }
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
      return applyAdminPayoutIntegrity(
        overlayDbPayoutStatus(latest, mergePayoutLists(latest, virtual)),
        [...auctionMap.values()],
        [...bidMap.values()].map((item) => ({
          id: item.id,
          auctionId: item.auction_id,
          bidAmount: item.bid_amount,
          status: item.status === 'selected' ? 'selected' : 'pending',
        })),
        profileTaxRefs,
      );
    } catch {
      return applyAdminPayoutIntegrity(
        overlayDbPayoutStatus(existing, mergePayoutLists(existing, virtual)),
        [...auctionMap.values()],
        [...bidMap.values()].map((item) => ({
          id: item.id,
          auctionId: item.auction_id,
          bidAmount: item.bid_amount,
          status: item.status === 'selected' ? 'selected' : 'pending',
        })),
        profileTaxRefs,
      );
    }
  }

  return applyAdminPayoutIntegrity(
    overlayDbPayoutStatus(existing, mergePayoutLists(existing, virtual)),
    [...auctionMap.values()],
    [...bidMap.values()].map((item) => ({
      id: item.id,
      auctionId: item.auction_id,
      bidAmount: item.bid_amount,
      status: item.status === 'selected' ? 'selected' : 'pending',
    })),
    profileTaxRefs,
  );
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
    isInvalidUuidError(error) ||
    error.code === 'PGRST116' ||
    /invalid input syntax for type uuid/i.test(error.message ?? '') ||
    /cannot coerce the result to a single json object/i.test(error.message ?? '') ||
    /0 rows/i.test(error.message ?? '')
  );
}

function preferPaymentOrderId(primary?: string | null, secondary?: string | null) {
  const first = (primary || '').trim();
  const second = (secondary || '').trim();
  if (first.startsWith('ord_')) {
    return first;
  }
  if (second.startsWith('ord_')) {
    return second;
  }
  if (first && !first.startsWith('payout-')) {
    return first;
  }
  if (second && !second.startsWith('payout-')) {
    return second;
  }
  return first || second || null;
}

function firstQueryRow<T>(data: T[] | T | null | undefined): T | null {
  if (!data) {
    return null;
  }
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  return data;
}

type ExistingPayoutLookup =
  | { ok: true; id: string; status: string; paymentOrderId: string | null }
  | { ok: false; message?: string };

async function findExistingPayoutRow(
  client: SponsorAuctionClient,
  keys: { id?: string; paymentOrderId?: string | null; auctionId?: string | null; bidId?: string | null },
): Promise<ExistingPayoutLookup> {
  const attempts: Array<
    () => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>
  > = [];

  const payoutId = keys.id?.trim() || '';
  const paymentOrderId = keys.paymentOrderId?.trim() || '';
  const auctionId = keys.auctionId?.trim() || '';
  const bidId = keys.bidId?.trim() || '';

  if (payoutId && isUuid(payoutId)) {
    attempts.push(() =>
      client.from('payouts').select('id, status, payment_order_id').eq('id', payoutId).limit(1),
    );
  }
  if (paymentOrderId) {
    attempts.push(() =>
      client
        .from('payouts')
        .select('id, status, payment_order_id')
        .eq('payment_order_id', paymentOrderId)
        .limit(1),
    );
  }
  if (auctionId && bidId) {
    attempts.push(() =>
      client
        .from('payouts')
        .select('id, status, payment_order_id')
        .eq('auction_id', auctionId)
        .eq('bid_id', bidId)
        .order('requested_at', { ascending: false })
        .limit(1),
    );
  } else if (auctionId) {
    attempts.push(() =>
      client
        .from('payouts')
        .select('id, status, payment_order_id')
        .eq('auction_id', auctionId)
        .neq('status', 'paid')
        .order('requested_at', { ascending: false })
        .limit(1),
    );
  }
  if (payoutId && !isUuid(payoutId) && !payoutId.startsWith('auction:') && payoutId !== paymentOrderId) {
    attempts.push(() =>
      client
        .from('payouts')
        .select('id, status, payment_order_id')
        .eq('payment_order_id', payoutId)
        .limit(1),
    );
  }

  for (const attempt of attempts) {
    const result = await attempt();
    if (result.error) {
      if (
        isSchemaMismatch(result.error) ||
        /payout_status|invalid input value/i.test(result.error.message ?? '')
      ) {
        return {
          ok: false,
          message: '정산 상태가 데이터베이스에 없습니다. 마이그레이션을 적용해 주세요.',
        };
      }
      if (isInvalidUuidError(result.error) || isSkippableWriteError(result.error)) {
        continue;
      }
      continue;
    }
    const row = firstQueryRow(result.data as Array<{ id?: string; status?: string; payment_order_id?: string | null }>);
    if (row?.id) {
      return {
        ok: true,
        id: String(row.id),
        status: String(row.status ?? ''),
        paymentOrderId: row.payment_order_id ?? null,
      };
    }
  }

  return { ok: false };
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
    if (byAuction.error && isInvalidUuidError(byAuction.error)) {
      return null;
    }
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
  if (!isUuid(auctionId)) {
    return undefined;
  }
  const full = await client
    .from('bids')
    .select(BID_LOOKUP_COLUMNS)
    .eq('auction_id', auctionId)
    .eq('status', 'selected')
    .limit(1);
  if (!full.error) {
    return (full.data?.[0] as BidLookup | undefined) ?? undefined;
  }
  const core = await client
    .from('bids')
    .select(BID_LOOKUP_CORE)
    .eq('auction_id', auctionId)
    .eq('status', 'selected')
    .limit(1);
  return (core.data?.[0] as BidLookup | undefined) ?? undefined;
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
  const existing = await findExistingPayoutRow(client, {
    id: rawId,
    paymentOrderId: row.payment_order_id,
    auctionId: row.auction_id,
    bidId: row.bid_id,
  });
  if (existing.ok === false && existing.message) {
    return { ok: false, message: existing.message };
  }
  const paymentOrderId = preferPaymentOrderId(
    existing.ok ? existing.paymentOrderId : null,
    row.payment_order_id,
  );
  const paidPatch = {
    status: 'paid' as const,
    paid_at: row.paid_at,
    amount: row.amount,
    creator_id: row.creator_id,
    creator_name: row.creator_name,
    creator_email: row.creator_email,
    auction_title: row.auction_title,
    requested_at: row.requested_at,
    payment_order_id: paymentOrderId,
    auction_id: row.auction_id,
    bid_id: row.bid_id,
  };
  const insertRow = {
    ...row,
    payment_order_id: paymentOrderId,
  };

  if (existing.ok) {
    const byExisting = await client
      .from('payouts')
      .update(paidPatch)
      .eq('id', existing.id)
      .select(PAYOUT_COLUMNS)
      .maybeSingle();
    const mappedExisting = mapWriteResult(byExisting.data);
    if (mappedExisting) {
      return { ok: true, data: { ...mappedExisting, status: 'paid' } };
    }
    if (byExisting.error && !isSkippableWriteError(byExisting.error)) {
      errors.push(`update(existing): ${formatSupabaseError(byExisting.error)}`);
    } else {
      const coreExisting = await client
        .from('payouts')
        .update({ status: 'paid', paid_at: row.paid_at })
        .eq('id', existing.id)
        .select(PAYOUT_COLUMNS_CORE)
        .maybeSingle();
      const mappedCore = mapWriteResult({
        ...(coreExisting.data as object | null),
        paid_at: row.paid_at,
        payment_order_id: paymentOrderId,
        auction_id: row.auction_id,
        bid_id: row.bid_id,
      });
      if (coreExisting.data && mappedCore) {
        return { ok: true, data: { ...mappedCore, status: 'paid' } };
      }
      if (coreExisting.error && !isSkippableWriteError(coreExisting.error)) {
        errors.push(`update(existing-core): ${formatSupabaseError(coreExisting.error)}`);
      }
    }
  }

  const upsert = await client
    .from('payouts')
    .upsert(insertRow, { onConflict: 'payment_order_id' })
    .select(PAYOUT_COLUMNS)
    .maybeSingle();
  const upserted = mapWriteResult(upsert.data);
  if (upserted) {
    return { ok: true, data: { ...upserted, status: 'paid' } };
  }
  if (upsert.error) {
    errors.push(`upsert: ${formatSupabaseError(upsert.error)}`);
  }

  const inserted = await client.from('payouts').insert(insertRow).select(PAYOUT_COLUMNS).maybeSingle();
  const insertedMapped = mapWriteResult(inserted.data);
  if (insertedMapped) {
    return { ok: true, data: { ...insertedMapped, status: 'paid' } };
  }
  if (inserted.error) {
    errors.push(`insert: ${formatSupabaseError(inserted.error)}`);
  }

  if (paymentOrderId) {
    const byOrder = await client
      .from('payouts')
      .update(paidPatch)
      .eq('payment_order_id', paymentOrderId)
      .select(PAYOUT_COLUMNS)
      .maybeSingle();
    const mapped = mapWriteResult(byOrder.data);
    if (mapped) {
      return { ok: true, data: { ...mapped, status: 'paid' } };
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
      return { ok: true, data: { ...mapped, status: 'paid' } };
    }
    if (byId.error && !isSkippableWriteError(byId.error)) {
      errors.push(`update(id): ${formatSupabaseError(byId.error)}`);
    }
  }

  if (row.auction_id && row.bid_id) {
    const byDeal = await client
      .from('payouts')
      .update(paidPatch)
      .eq('auction_id', row.auction_id)
      .eq('bid_id', row.bid_id)
      .select(PAYOUT_COLUMNS)
      .limit(1);
    const dealRow = firstQueryRow(byDeal.data);
    const mapped = mapWriteResult(dealRow);
    if (mapped) {
      return { ok: true, data: { ...mapped, status: 'paid' } };
    }
    if (byDeal.error && !isSkippableWriteError(byDeal.error)) {
      errors.push(`update(deal): ${formatSupabaseError(byDeal.error)}`);
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
    payment_order_id: paymentOrderId,
    auction_id: row.auction_id,
    bid_id: row.bid_id,
  });
  if (coreInsert.data && coreMapped) {
    return { ok: true, data: { ...coreMapped, status: 'paid' } };
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
      return { ok: true, data: { ...mapped, status: 'paid' } };
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

async function findPayoutHoldTarget(
  client: SponsorAuctionClient,
  rawId: string,
  extra?: { paymentOrderId?: string | null; auctionId?: string | null; bidId?: string | null },
): Promise<{ ok: true; id: string; status: string } | { ok: false; message: string }> {
  const auctionId =
    extra?.auctionId || (rawId.startsWith('auction:') ? rawId.slice('auction:'.length).trim() : '');
  const found = await findExistingPayoutRow(client, {
    id: rawId,
    paymentOrderId: extra?.paymentOrderId || (!isUuid(rawId) && !rawId.startsWith('auction:') ? rawId : ''),
    auctionId,
    bidId: extra?.bidId,
  });
  if (found.ok) {
    return { ok: true, id: found.id, status: found.status };
  }
  if (found.message) {
    return { ok: false, message: found.message };
  }
  return { ok: false, message: '정산 행을 찾지 못했습니다.' };
}

export async function setPayoutHold(
  client: SponsorAuctionClient,
  input: {
    id: string;
    hold: boolean;
    paymentOrderId?: string | null;
    auctionId?: string | null;
    bidId?: string | null;
  },
): Promise<{ ok: true; data: PayoutItem } | { ok: false; message: string }> {
  const id = input.id.trim();
  if (!id && !input.paymentOrderId && !input.auctionId) {
    return { ok: false, message: '정산 ID가 필요합니다.' };
  }
  const current = await findPayoutHoldTarget(client, id || input.paymentOrderId || '', {
    paymentOrderId: input.paymentOrderId,
    auctionId: input.auctionId,
    bidId: input.bidId,
  });
  if (!current.ok) {
    return current;
  }
  const status = current.status;
  if (status === 'paid' || status === 'cancelled') {
    return { ok: false, message: '지급 완료이거나 취소된 정산은 보류할 수 없습니다.' };
  }
  const next = input.hold ? 'hold' : 'pending';
  if (input.hold && status !== 'pending' && status !== 'hold') {
    return { ok: false, message: '지급 대기 건만 보류할 수 있습니다.' };
  }
  if (!input.hold && status !== 'hold') {
    return { ok: false, message: '보류 중인 정산만 해제할 수 있습니다.' };
  }
  const updated = await client
    .from('payouts')
    .update({ status: next })
    .eq('id', current.id)
    .select(PAYOUT_COLUMNS_BANK)
    .maybeSingle();
  if (updated.error) {
    if (isSchemaMismatch(updated.error) || /payout_status|invalid input value/i.test(updated.error.message)) {
      return { ok: false, message: '정산 보류 상태가 데이터베이스에 없습니다. 마이그레이션을 적용해 주세요.' };
    }
    return { ok: false, message: '정산 보류를 저장하지 못했습니다.' };
  }
  if (!updated.data) {
    const fallback = await client
      .from('payouts')
      .select(PAYOUT_COLUMNS_CORE)
      .eq('id', current.id)
      .maybeSingle();
    const mappedFallback = fallback.data ? mapPayout(fallback.data) : null;
    if (mappedFallback) {
      return { ok: true, data: { ...mappedFallback, status: next } };
    }
    return { ok: false, message: '정산 보류 결과를 읽지 못했습니다.' };
  }
  const mapped = mapPayout(updated.data);
  if (!mapped) {
    return { ok: false, message: '정산 보류 결과를 읽지 못했습니다.' };
  }
  return { ok: true, data: mapped };
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

  const holdLookup = await findPayoutHoldTarget(client, orderId || rawId, {
    paymentOrderId: orderId || null,
    auctionId,
    bidId,
  });
  if (holdLookup.ok && holdLookup.status === 'hold') {
    return { ok: false, message: '보류 중인 정산은 지급할 수 없습니다. 보류를 해제한 뒤 지급해 주세요.' };
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
    bidId ? loadBidsForPayout(client, [bidId]) : Promise.resolve([]),
  ]);

  const auction = auctions[0];
  if (auction?.status === 'cancelled') {
    return { ok: false, message: VALIDATION.payoutCancelled };
  }
  let bid: BidLookup | undefined = bids[0];
  if (!bid && auction?.winner_bid_id) {
    const winners = await loadBidsForPayout(client, [auction.winner_bid_id]);
    bid = winners[0];
    bidId = bid?.id || bidId;
  }
  if (!bid && auctionId) {
    bid = await fetchSelectedBid(client, auctionId);
    bidId = bid?.id || bidId;
  }

  const creatorIdRaw = bid?.creator_id || input.creatorId || '';
  const profiles = creatorIdRaw ? await loadCreatorPayoutProfiles(client, [creatorIdRaw]) : [];
  const profile = profiles[0];

  const amount = Math.round(
    payoutRequestAmount(bid?.bid_amount ?? 0, Number(payment?.amount) || 0, profile) ||
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
  const account = payoutAccountFor(bid, profile);
  const settlement = settlementColumns(
    account,
    (typeof payment?.confirmed_at === 'string' && payment.confirmed_at) ||
      (typeof payment?.created_at === 'string' && payment.created_at) ||
      paidAt,
  );
  if (!settlementAccountError(account)) {
    Object.assign(row, settlement);
  } else if (settlement.settlement_due_at) {
    row.settlement_due_at = settlement.settlement_due_at;
  }

  const persistId = holdLookup.ok ? holdLookup.id : rawId;
  const persisted = await persistPaidPayout(client, row, persistId);
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

  return {
    ok: true,
    data: {
      ...persisted.data,
      bidAmount: bid?.bid_amount && bid.bid_amount > 0 ? bid.bid_amount : 0,
    },
  };
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

  if (input.auctionId && input.bidId) {
    const byDeal = await client
      .from('payouts')
      .update({ admin_memo: memo })
      .eq('auction_id', input.auctionId)
      .eq('bid_id', input.bidId)
      .select(PAYOUT_COLUMNS)
      .limit(1);
    if (byDeal.error && isSchemaMismatch(byDeal.error)) {
      return { ok: false, message: 'payouts.admin_memo 컬럼이 없습니다. schema.sql을 적용해 주세요.' };
    }
    const mappedDeal = mapWriteResult(firstQueryRow(byDeal.data));
    if (mappedDeal) {
      return { ok: true, data: { ...mappedDeal, adminMemo: memo } };
    }
    if (byDeal.error && !isSkippableWriteError(byDeal.error)) {
      errors.push(formatSupabaseError(byDeal.error));
    }
  }

  const attempts: Array<{ column: 'payment_order_id' | 'auction_id' | 'bid_id' | 'id'; value: string }> = [];
  if (input.id && isUuid(input.id)) {
    attempts.push({ column: 'id', value: input.id });
  }
  if (orderId) {
    attempts.push({ column: 'payment_order_id', value: orderId });
  }
  if (input.auctionId && !input.bidId) {
    attempts.push({ column: 'auction_id', value: input.auctionId });
  }
  if (input.bidId && !input.auctionId) {
    attempts.push({ column: 'bid_id', value: input.bidId });
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
