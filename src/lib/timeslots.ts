import { withExclusiveAction } from '@/lib/action-lock';
import {
  computeBidEngineStats,
  isDeadlinePassed,
  nextInventoryMinBid,
} from '@/lib/auction-engine';
import { mockGetSession } from '@/lib/auth-mock';
import { attachScore, getCreatorScoresByIds } from '@/lib/creator-metrics';
import { isPlatformType } from '@/lib/platforms';
import { getSupabaseClient, type SponsorAuctionClient } from '@/lib/supabase';
import { getDataClient } from '@/lib/supabase/data-client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { isUuid, uuidIds } from '@/lib/uuid';
import { VALIDATION, validateTimeSlotPayload } from '@/lib/validation';
import { maskOffPlatformContact, sanitizeUserText } from '@/utils/filter';
import type { DataResult } from '@/types/auction';
import type { Database } from '@/types/database';
import {
  isTimeSlotOpen,
  type CreateTimeSlotInput,
  type PlaceTimeSlotBidInput,
  type TimeSlotBidItem,
  type TimeSlotItem,
  type TimeSlotStatus,
} from '@/types/timeslot';

const SLOT_COLUMNS =
  'id, creator_id, creator_name, title, platform, description, expected_views, starting_price, current_highest_bid, bids_count, slot_start, slot_end, deadline, status, winner_bid_id, created_at';

const SLOT_BID_COLUMNS =
  'id, time_slot_id, advertiser_id, advertiser_name, bid_amount, message, created_at';

const INSERT_FAIL_MESSAGE = '등록에 실패했습니다. 다시 시도해 주세요.';
const UPDATE_FAIL_MESSAGE = '변경에 실패했습니다. 다시 시도해 주세요.';

type SlotRow = Database['public']['Tables']['time_slots']['Row'];
type SlotBidRow = Database['public']['Tables']['time_slot_bids']['Row'];

const STORAGE_SLOTS = 'sponsor-auction-timeslots-v2';
const STORAGE_BIDS = 'sponsor-auction-timeslot-bids';

function offsetIso(daysFromNow: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

function applySlotExpiry(slot: TimeSlotItem, now = Date.now()): TimeSlotItem {
  if (slot.status === 'open' && !slot.winnerBidId && isDeadlinePassed(slot.deadline, now)) {
    return { ...slot, status: 'closed' };
  }
  return slot;
}

function mapSlot(row: Partial<SlotRow> & Pick<SlotRow, 'id'>): TimeSlotItem {
  const platformRaw = String(row.platform ?? '');
  return applySlotExpiry({
    id: row.id,
    creatorId: row.creator_id ?? null,
    creatorName: row.creator_name ?? '크리에이터',
    title: row.title ?? '제목 없음',
    platform: isPlatformType(platformRaw) ? platformRaw : 'other',
    description: row.description ?? '',
    expectedViews: row.expected_views ?? 0,
    startingPrice: row.starting_price ?? 0,
    currentHighestBid: row.current_highest_bid ?? 0,
    bidsCount: row.bids_count ?? 0,
    slotStart: row.slot_start ?? '',
    slotEnd: row.slot_end ?? '',
    deadline: row.deadline ?? '',
    status: (row.status ?? 'open') as TimeSlotStatus,
    winnerBidId: row.winner_bid_id ?? null,
    isBlind: Boolean(row.is_blind),
    deliveryUrl: row.delivery_url ?? null,
    deliveredAt: row.delivered_at ?? null,
    purchaseConfirmedAt: row.purchase_confirmed_at ?? null,
    createdAt: row.created_at ?? '',
  });
}

function mapSlotBid(row: Partial<SlotBidRow> & Pick<SlotBidRow, 'id'>, leadingAmount = 0): TimeSlotBidItem {
  const amount = row.bid_amount ?? 0;
  return {
    id: row.id,
    timeSlotId: row.time_slot_id ?? '',
    advertiserId: row.advertiser_id ?? null,
    advertiserName: row.advertiser_name ?? '광고주',
    bidAmount: amount,
    message: maskOffPlatformContact(row.message ?? ''),
    createdAt: row.created_at ?? '',
    isLeading: leadingAmount > 0 && amount === leadingAmount,
  };
}

function readList<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') {
    return [...fallback];
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [...fallback];
    }
    const parsed = JSON.parse(raw) as T[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...fallback];
  } catch {
    return [...fallback];
  }
}

const seedSlots: TimeSlotItem[] = [
  {
    id: 'slot-001',
    creatorId: 'usr-006',
    creatorName: '민지쇼츠',
    title: '주말 한강 피크닉 숏폼 1편',
    platform: 'youtube_shorts',
    description:
      '토요일 오후 업로드 예정. 제품 언박싱+실사용 15초. 평균 조회수 42만, 예상 조회수 40만 회 광고 상품입니다.',
    expectedViews: 400_000,
    startingPrice: 800_000,
    currentHighestBid: 920_000,
    bidsCount: 2,
    slotStart: offsetIso(7, 14),
    slotEnd: offsetIso(7, 16),
    deadline: offsetIso(6, 18),
    status: 'open',
    winnerBidId: null,
    createdAt: '2026-10-18T10:00:00+09:00',
  },
  {
    id: 'slot-002',
    creatorId: 'usr-demo-creator',
    creatorName: '데모 크리에이터',
    title: '평일 루틴 브이로그 중간 광고 컷',
    platform: 'youtube',
    description: '구독자 대상 루틴 영상에 브랜드 컷 20초를 넣을 수 있는 광고 상품입니다.',
    expectedViews: 80_000,
    startingPrice: 350_000,
    currentHighestBid: 0,
    bidsCount: 0,
    slotStart: offsetIso(10, 20),
    slotEnd: offsetIso(10, 22),
    deadline: offsetIso(9, 23),
    status: 'open',
    winnerBidId: null,
    createdAt: '2026-10-19T09:30:00+09:00',
  },
  {
    id: 'slot-003',
    creatorId: 'usr-007',
    creatorName: '피부일기 하연',
    title: '7일 스킨케어 트래킹 릴스',
    platform: 'instagram_reels',
    description: '민감성 피부 루틴 시리즈 중 1회차. 예상 조회수 12만.',
    expectedViews: 120_000,
    startingPrice: 500_000,
    currentHighestBid: 610_000,
    bidsCount: 1,
    slotStart: '2026-10-12T19:00:00+09:00',
    slotEnd: '2026-10-12T20:00:00+09:00',
    deadline: '2026-10-11T18:00:00+09:00',
    status: 'awarded',
    winnerBidId: 'slot-bid-003',
    createdAt: '2026-10-05T11:00:00+09:00',
  },
];

const seedSlotBids: TimeSlotBidItem[] = [
  {
    id: 'slot-bid-001',
    timeSlotId: 'slot-001',
    advertiserId: 'usr-001',
    advertiserName: '한강브루어리',
    bidAmount: 920_000,
    message: '무알콜 맥주 컷을 한강 장면에 자연스럽게 넣고 싶습니다.',
    createdAt: '2026-10-20T11:10:00+09:00',
    isLeading: true,
  },
  {
    id: 'slot-bid-002',
    timeSlotId: 'slot-001',
    advertiserId: 'usr-demo-advertiser',
    advertiserName: '데모 광고주',
    bidAmount: 850_000,
    message: '브랜드 톤앤매너에 맞춰 제품만 짧게 노출해도 됩니다.',
    createdAt: '2026-10-19T16:40:00+09:00',
  },
  {
    id: 'slot-bid-003',
    timeSlotId: 'slot-003',
    advertiserId: 'usr-002',
    advertiserName: '아워피부랩',
    bidAmount: 610_000,
    message: '7일 트래킹 그리드에 제품 텍스처 클로즈업을 부탁드립니다.',
    createdAt: '2026-10-10T09:20:00+09:00',
    isLeading: true,
  },
];

let slotsStore: TimeSlotItem[] = readList(STORAGE_SLOTS, seedSlots);
let slotBidsStore: TimeSlotBidItem[] = readList(STORAGE_BIDS, seedSlotBids);

function persistSlots() {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_SLOTS, JSON.stringify(slotsStore));
    window.localStorage.setItem(STORAGE_BIDS, JSON.stringify(slotBidsStore));
  } catch {
    // 저장 실패해도 메모리 값은 유지합니다.
  }
}

async function getTimeslotReadClient(preferred?: SponsorAuctionClient | null) {
  if (preferred) {
    return preferred;
  }
  const live = await getDataClient();
  if (live) {
    return live;
  }
  try {
    const mock = await mockGetSession();
    if (mock.data) {
      return null;
    }
  } catch {
    // 데모 세션이 없으면 공개 조회 클라이언트를 이어갑니다.
  }
  return getSupabaseClient();
}

function refreshMockSlotEngine(slotId: string) {
  const amounts = slotBidsStore
    .filter((item) => item.timeSlotId === slotId)
    .map((item) => item.bidAmount);
  const stats = computeBidEngineStats(amounts);
  slotsStore = slotsStore.map((slot) =>
    slot.id === slotId
      ? {
          ...slot,
          currentHighestBid: stats.highestBidAmount,
          bidsCount: stats.bidsCount,
        }
      : slot,
  );
}

async function withScores(slots: TimeSlotItem[]): Promise<TimeSlotItem[]> {
  const scores = await getCreatorScoresByIds(slots.map((item) => item.creatorId));
  return slots.map((item) => attachScore(item, scores));
}

async function attachFulfillment(
  supabase: SponsorAuctionClient,
  slots: TimeSlotItem[],
): Promise<TimeSlotItem[]> {
  const ids = uuidIds(slots.map((item) => item.id));
  if (ids.length === 0) {
    return slots;
  }
  try {
    const full = await supabase
      .from('time_slots')
      .select('id, delivery_url, delivered_at, purchase_confirmed_at, is_blind')
      .in('id', ids);
    const result =
      full.error && isSchemaMismatch(full.error)
        ? await supabase
            .from('time_slots')
            .select('id, delivery_url, delivered_at, purchase_confirmed_at')
            .in('id', ids)
        : full;
    if (result.error || !result.data) {
      return slots;
    }
    const extra = new Map(result.data.map((row) => [row.id, row]));
    return slots.map((item) => {
      const row = extra.get(item.id);
      if (!row) {
        return item;
      }
      return {
        ...item,
        isBlind: 'is_blind' in row ? Boolean(row.is_blind) : item.isBlind,
        deliveryUrl: row.delivery_url ?? null,
        deliveredAt: row.delivered_at ?? null,
        purchaseConfirmedAt: row.purchase_confirmed_at ?? null,
      };
    });
  } catch {
    return slots;
  }
}

function mockSlotList(creatorId?: string) {
  return slotsStore
    .map((item) => applySlotExpiry(item))
    .filter((item) => (creatorId ? item.creatorId === creatorId : true));
}

export function partitionTimeSlots(slots: TimeSlotItem[]) {
  const open: TimeSlotItem[] = [];
  const closed: TimeSlotItem[] = [];
  for (const slot of slots) {
    if (isTimeSlotOpen(slot)) {
      open.push(slot);
    } else {
      closed.push(slot);
    }
  }
  return { open, closed };
}

export async function listTimeSlots(options?: {
  creatorId?: string;
  client?: SponsorAuctionClient | null;
  includeHidden?: boolean;
}): Promise<DataResult<TimeSlotItem[]>> {
  const creatorId = options?.creatorId?.trim() || undefined;
  if (creatorId && !isUuid(creatorId)) {
    return ok(await withScores(mockSlotList(creatorId)));
  }

  const supabase = await getTimeslotReadClient(options?.client);
  if (!supabase) {
    const mock = await withScores(mockSlotList(creatorId));
    return ok(options?.includeHidden ? mock : mock.filter((item) => !item.isBlind));
  }

  try {
    let query = supabase.from('time_slots').select(SLOT_COLUMNS).order('created_at', {
      ascending: false,
    });
    if (creatorId) {
      query = query.eq('creator_id', creatorId);
    }
    const { data, error } = await query;
    if (error) {
      if (isSchemaMismatch(error)) {
        return ok(await withScores(mockSlotList(creatorId)));
      }
      console.warn('[SponsorAuction] 크리에이터 상품 목록 조회 실패', error.message);
      return fail([], '크리에이터 상품 목록을 불러오지 못했습니다.');
    }
    const mapped = await withScores(
      await attachFulfillment(supabase, (data ?? []).map((row) => mapSlot(row))),
    );
    return ok(options?.includeHidden ? mapped : mapped.filter((item) => !item.isBlind));
  } catch {
    return fail([], '크리에이터 상품 목록을 불러오지 못했습니다.');
  }
}

function normalizeSlotId(id: string) {
  try {
    return decodeURIComponent(id.trim());
  } catch {
    return id.trim();
  }
}

export async function getTimeSlotById(
  id: string,
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotItem | null>> {
  const slotId = normalizeSlotId(id);
  if (!slotId) {
    return fail(null, '크리에이터 상품 ID가 필요합니다.');
  }
  const supabase = await getTimeslotReadClient(client);
  if (!supabase || !isUuid(slotId)) {
    const found = slotsStore.find((item) => item.id === slotId) ?? null;
    if (!found) {
      return fail(null, '크리에이터 상품을 찾을 수 없습니다.');
    }
    const [withScore] = await withScores([applySlotExpiry(found)]);
    return ok(withScore ?? applySlotExpiry(found));
  }

  try {
    const { data, error } = await supabase
      .from('time_slots')
      .select(SLOT_COLUMNS)
      .eq('id', slotId)
      .maybeSingle();
    if (error) {
      if (isSchemaMismatch(error)) {
        const found = slotsStore.find((item) => item.id === slotId) ?? null;
        if (found) {
          const [withScore] = await withScores([applySlotExpiry(found)]);
          return ok(withScore ?? applySlotExpiry(found));
        }
      }
      console.warn('[SponsorAuction] 크리에이터 상품 조회 실패', error.message);
      return fail(null, '크리에이터 상품을 찾을 수 없습니다.');
    }
    if (!data) {
      const found = slotsStore.find((item) => item.id === slotId) ?? null;
      if (found) {
        const [withScore] = await withScores([applySlotExpiry(found)]);
        return ok(withScore ?? applySlotExpiry(found));
      }
      return fail(null, '크리에이터 상품을 찾을 수 없습니다.');
    }
    const [mapped] = await attachFulfillment(supabase, [mapSlot(data)]);
    const [withScore] = await withScores([mapped ?? mapSlot(data)]);
    return ok(withScore ?? mapped ?? mapSlot(data));
  } catch {
    return fail(null, '크리에이터 상품을 불러오지 못했습니다.');
  }
}

export async function listTimeSlotBids(
  slotId: string,
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotBidItem[]>> {
  const id = normalizeSlotId(slotId);
  if (!id) {
    return fail([], '크리에이터 상품 ID가 필요합니다.');
  }
  const supabase = await getTimeslotReadClient(client);
  if (!supabase || !isUuid(id)) {
    const bids = slotBidsStore
      .filter((item) => item.timeSlotId === id)
      .sort((left, right) => right.bidAmount - left.bidAmount);
    const leading = bids[0]?.bidAmount ?? 0;
    return ok(bids.map((item) => ({ ...item, isLeading: item.bidAmount === leading })));
  }

  try {
    const { data, error } = await supabase
      .from('time_slot_bids')
      .select(SLOT_BID_COLUMNS)
      .eq('time_slot_id', id)
      .order('bid_amount', { ascending: false });
    if (error) {
      if (isSchemaMismatch(error)) {
        const bids = slotBidsStore
          .filter((item) => item.timeSlotId === id)
          .sort((left, right) => right.bidAmount - left.bidAmount);
        const leading = bids[0]?.bidAmount ?? 0;
        return ok(bids.map((item) => ({ ...item, isLeading: item.bidAmount === leading })));
      }
      return fail([], '제안 목록을 불러오지 못했습니다.');
    }
    const amounts = (data ?? []).map((row) => row.bid_amount ?? 0);
    const leading = computeBidEngineStats(amounts).highestBidAmount;
    return ok((data ?? []).map((row) => mapSlotBid(row, leading)));
  } catch {
    return fail([], '제안 목록을 불러오지 못했습니다.');
  }
}

function rememberMockSlot(slot: TimeSlotItem) {
  slotsStore = [slot, ...slotsStore.filter((item) => item.id !== slot.id)];
  persistSlots();
}

export async function createTimeSlot(
  input: CreateTimeSlotInput,
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotItem | null>> {
  const invalid = validateTimeSlotPayload(input);
  if (invalid) {
    return fail(null, invalid);
  }

  const payload = {
    creator_id: input.creatorId && isUuid(input.creatorId) ? input.creatorId : null,
    creator_name: (input.creatorName ?? '').trim() || '크리에이터',
    title: input.title.trim(),
    platform: input.platform,
    description: input.description.trim(),
    expected_views: input.expectedViews,
    starting_price: input.startingPrice,
    slot_start: input.slotStart,
    slot_end: input.slotEnd,
    deadline: input.deadline,
    status: 'open' as const,
  };

  const supabase = client ?? (await getDataClient());
  if (!supabase || !payload.creator_id) {
    if (supabase && !payload.creator_id) {
      return fail(null, '크리에이터 상품을 등록할 계정 정보가 없습니다.');
    }
    const created: TimeSlotItem = {
      id: `slot-${Date.now()}`,
      creatorId: input.creatorId ?? null,
      creatorName: payload.creator_name,
      title: payload.title,
      platform: payload.platform,
      description: payload.description,
      expectedViews: payload.expected_views,
      startingPrice: payload.starting_price,
      currentHighestBid: 0,
      bidsCount: 0,
      slotStart: payload.slot_start,
      slotEnd: payload.slot_end,
      deadline: payload.deadline,
      status: 'open',
      winnerBidId: null,
      createdAt: new Date().toISOString(),
    };
    rememberMockSlot(created);
    const [withScore] = await withScores([created]);
    return ok(withScore ?? created);
  }

  try {
    const { data, error } = await supabase
      .from('time_slots')
      .insert(payload)
      .select(SLOT_COLUMNS)
      .single();
    if (error || !data) {
      console.warn('[SponsorAuction] 크리에이터 상품 등록 실패', error?.message);
      return fail(null, INSERT_FAIL_MESSAGE);
    }
    const mapped = mapSlot(data);
    rememberMockSlot(mapped);
    const [withScore] = await withScores([mapped]);
    return ok(withScore ?? mapped);
  } catch {
    return fail(null, INSERT_FAIL_MESSAGE);
  }
}

export async function closeTimeSlot(
  id: string,
  creatorId?: string | null,
  client?: SponsorAuctionClient | null,
) {
  const slotId = normalizeSlotId(id);
  const current = await getTimeSlotById(slotId, client);
  if (!current.data) {
    return fail(null, current.error ?? '크리에이터 상품을 찾을 수 없습니다.');
  }
  if (creatorId && current.data.creatorId && current.data.creatorId !== creatorId) {
    return fail(null, '본인 상품만 마감할 수 있습니다.');
  }
  if (current.data.status === 'awarded' || current.data.winnerBidId) {
    return fail(null, '낙찰된 상품은 마감할 수 없습니다. 숨김 처리를 이용해 주세요.');
  }
  const supabase = client ?? (await getDataClient());
  if (!supabase || !isUuid(slotId)) {
    slotsStore = slotsStore.map((item) =>
      item.id === slotId ? { ...item, status: 'closed' as const } : item,
    );
    persistSlots();
    return getTimeSlotById(slotId, client);
  }
  try {
    const { data, error } = await supabase
      .from('time_slots')
      .update({ status: 'closed' })
      .eq('id', slotId)
      .select(SLOT_COLUMNS)
      .single();
    if (error || !data) {
      return fail(null, UPDATE_FAIL_MESSAGE);
    }
    return ok(mapSlot(data));
  } catch {
    return fail(null, UPDATE_FAIL_MESSAGE);
  }
}

export async function setTimeSlotBlind(
  id: string,
  isBlind: boolean,
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotItem | null>> {
  const slotId = normalizeSlotId(id);
  const current = await getTimeSlotById(slotId, client);
  if (!current.data) {
    return fail(null, current.error ?? '크리에이터 상품을 찾을 수 없습니다.');
  }
  const supabase = client ?? (await getDataClient());
  if (!supabase || !isUuid(slotId)) {
    slotsStore = slotsStore.map((item) =>
      item.id === slotId ? { ...item, isBlind } : item,
    );
    persistSlots();
    return getTimeSlotById(slotId, client);
  }
  try {
    const { data, error } = await supabase
      .from('time_slots')
      .update({ is_blind: isBlind })
      .eq('id', slotId)
      .select(SLOT_COLUMNS)
      .maybeSingle();
    if (error) {
      if (isSchemaMismatch(error)) {
        return fail(null, '숨김 처리 컬럼이 없습니다. 마이그레이션을 적용해 주세요.');
      }
      return fail(null, UPDATE_FAIL_MESSAGE);
    }
    if (!data) {
      return fail(null, UPDATE_FAIL_MESSAGE);
    }
    return ok({ ...mapSlot(data), isBlind });
  } catch {
    return fail(null, UPDATE_FAIL_MESSAGE);
  }
}

export async function placeTimeSlotBid(
  input: PlaceTimeSlotBidInput,
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotBidItem | null>> {
  const slotId = normalizeSlotId(input.timeSlotId);
  const lockKey = `slot-bid:${slotId}:${(input.advertiserId || input.advertiserName || '').trim().toLowerCase()}`;
  return withExclusiveAction(lockKey, fail(null, VALIDATION.actionInFlight), async () => {
    const slotResult = await getTimeSlotById(slotId, client);
    const slot = slotResult.data;
    if (!slot) {
      return fail(null, slotResult.error ?? '크리에이터 상품을 찾을 수 없습니다.');
    }
    const live = applySlotExpiry(slot);
    if (live.isBlind) {
      return fail(null, '숨김 처리된 상품에는 제안할 수 없습니다.');
    }
    if (live.status !== 'open' || live.winnerBidId) {
      return fail(null, '마감된 상품에는 제안할 수 없습니다.');
    }
    if (input.advertiserId && slot.creatorId && input.advertiserId === slot.creatorId) {
      return fail(null, '본인 상품에는 제안할 수 없습니다.');
    }
    const advertiserId = input.advertiserId?.trim() || '';
    if (advertiserId) {
      const already = isUuid(slotId)
        ? null
        : slotBidsStore.find(
            (item) => item.timeSlotId === slotId && item.advertiserId === advertiserId,
          );
      if (already) {
        return fail(null, VALIDATION.duplicateTimeslotBid);
      }
    }
    const minBid = nextInventoryMinBid(live.startingPrice, live.currentHighestBid);
    if (!Number.isFinite(input.bidAmount) || input.bidAmount < minBid) {
      return fail(null, `제안가는 ${minBid.toLocaleString('ko-KR')}원 이상이어야 합니다.`);
    }
    let message = '';
    try {
      message = sanitizeUserText(input.message || '상품 제안', 'reject');
    } catch {
      return fail(null, VALIDATION.offPlatformContact);
    }

    const supabase = client ?? (await getDataClient());
    if (isUuid(slotId)) {
      if (!supabase) {
        return fail(null, INSERT_FAIL_MESSAGE);
      }
      if (advertiserId && isUuid(advertiserId)) {
        const existing = await supabase
          .from('time_slot_bids')
          .select('id')
          .eq('time_slot_id', slotId)
          .eq('advertiser_id', advertiserId)
          .maybeSingle();
        if (existing.data?.id) {
          return fail(null, VALIDATION.duplicateTimeslotBid);
        }
      }
      try {
        const { data, error } = await supabase
          .from('time_slot_bids')
          .insert({
            time_slot_id: slotId,
            advertiser_id:
              input.advertiserId && isUuid(input.advertiserId) ? input.advertiserId : null,
            advertiser_name: (input.advertiserName ?? '').trim() || '광고주',
            bid_amount: input.bidAmount,
            message,
          })
          .select(SLOT_BID_COLUMNS)
          .single();
        if (error || !data) {
          console.warn('[SponsorAuction] 크리에이터 상품 제안 등록 실패', error?.message);
          return fail(null, INSERT_FAIL_MESSAGE);
        }
        return ok(mapSlotBid(data, input.bidAmount));
      } catch {
        return fail(null, INSERT_FAIL_MESSAGE);
      }
    }

    const created: TimeSlotBidItem = {
      id: `slot-bid-${Date.now()}`,
      timeSlotId: slotId,
      advertiserId: input.advertiserId ?? null,
      advertiserName: (input.advertiserName ?? '').trim() || '광고주',
      bidAmount: input.bidAmount,
      message,
      createdAt: new Date().toISOString(),
      isLeading: true,
    };
    slotBidsStore = [created, ...slotBidsStore];
    refreshMockSlotEngine(slotId);
    persistSlots();
    return ok(created);
  });
}

export async function listTimeSlotsByIds(
  ids: string[],
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotItem[]>> {
  const unique = uuidIds(ids);
  const mockMatches = slotsStore.filter((item) => ids.includes(item.id)).map((item) => applySlotExpiry(item));
  if (unique.length === 0) {
    return ok(await withScores(mockMatches));
  }
  const supabase = await getTimeslotReadClient(client);
  if (!supabase) {
    return ok(await withScores(mockMatches));
  }
  try {
    const { data, error } = await supabase
      .from('time_slots')
      .select(SLOT_COLUMNS)
      .in('id', unique)
      .order('created_at', { ascending: false });
    if (error) {
      if (isSchemaMismatch(error)) {
        return ok(await withScores(mockMatches));
      }
      return fail([], '크리에이터 상품 목록을 불러오지 못했습니다.');
    }
    return ok(
      await withScores(await attachFulfillment(supabase, (data ?? []).map((row) => mapSlot(row)))),
    );
  } catch {
    return fail([], '크리에이터 상품 목록을 불러오지 못했습니다.');
  }
}

export async function listTimeSlotBidsForAdvertiser(
  advertiserId: string,
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotBidItem[]>> {
  if (!advertiserId.trim()) {
    return ok([]);
  }
  const supabase = await getTimeslotReadClient(client);
  if (!supabase || !isUuid(advertiserId)) {
    const bids = slotBidsStore.filter((item) => item.advertiserId === advertiserId);
    return ok(bids);
  }
  try {
    const { data, error } = await supabase
      .from('time_slot_bids')
      .select(SLOT_BID_COLUMNS)
      .eq('advertiser_id', advertiserId)
      .order('created_at', { ascending: false });
    if (error) {
      if (isSchemaMismatch(error)) {
        return ok(slotBidsStore.filter((item) => item.advertiserId === advertiserId));
      }
      return fail([], '제안 목록을 불러오지 못했습니다.');
    }
    return ok((data ?? []).map((row) => mapSlotBid(row)));
  } catch {
    return fail([], '제안 목록을 불러오지 못했습니다.');
  }
}

export async function listTimeSlotBidsBySlotIds(
  slotIds: string[],
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotBidItem[]>> {
  const unique = uuidIds(slotIds);
  const mockMatches = slotBidsStore.filter((item) => slotIds.includes(item.timeSlotId));
  if (unique.length === 0) {
    return ok(mockMatches);
  }
  const supabase = await getTimeslotReadClient(client);
  if (!supabase) {
    return ok(mockMatches);
  }
  try {
    const { data, error } = await supabase
      .from('time_slot_bids')
      .select(SLOT_BID_COLUMNS)
      .in('time_slot_id', unique)
      .order('created_at', { ascending: false });
    if (error) {
      if (isSchemaMismatch(error)) {
        return ok(mockMatches);
      }
      return fail([], '제안 목록을 불러오지 못했습니다.');
    }
    return ok((data ?? []).map((row) => mapSlotBid(row)));
  } catch {
    return fail([], '제안 목록을 불러오지 못했습니다.');
  }
}

export async function awardTimeSlotBid(
  slotId: string,
  bidId: string,
  creatorId?: string | null,
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotItem | null>> {
  const slotResult = await getTimeSlotById(slotId, client);
  const slot = slotResult.data;
  if (!slot) {
    return fail(null, slotResult.error ?? '크리에이터 상품을 찾을 수 없습니다.');
  }
  if (creatorId && slot.creatorId && slot.creatorId !== creatorId) {
    return fail(null, '본인 상품만 낙찰할 수 있습니다.');
  }
  if (slot.status !== 'open' || slot.winnerBidId) {
    return fail(null, '이미 마감된 상품입니다.');
  }

  const bids = await listTimeSlotBids(slotId, client);
  const winner = bids.data.find((item) => item.id === bidId);
  if (!winner) {
    return fail(null, '선정할 제안을 찾을 수 없습니다.');
  }

  const supabase = client ?? (await getDataClient());
  if (!supabase || !isUuid(slotId)) {
    slotsStore = slotsStore.map((item) =>
      item.id === slotId
        ? { ...item, status: 'awarded' as const, winnerBidId: bidId }
        : item,
    );
    persistSlots();
    return getTimeSlotById(slotId);
  }

  try {
    const { data, error } = await supabase
      .from('time_slots')
      .update({ status: 'awarded', winner_bid_id: isUuid(bidId) ? bidId : null })
      .eq('id', slotId)
      .eq('status', 'open')
      .is('winner_bid_id', null)
      .select(SLOT_COLUMNS)
      .maybeSingle();
    if (error) {
      return fail(null, UPDATE_FAIL_MESSAGE);
    }
    if (!data) {
      return fail(null, '이미 마감된 상품입니다.');
    }
    return ok(mapSlot(data));
  } catch {
    return fail(null, UPDATE_FAIL_MESSAGE);
  }
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function applyFulfillment(
  slot: TimeSlotItem,
  patch: {
    deliveryUrl?: string | null;
    deliveredAt?: string | null;
    purchaseConfirmedAt?: string | null;
  },
): TimeSlotItem {
  return {
    ...slot,
    deliveryUrl: patch.deliveryUrl ?? slot.deliveryUrl ?? null,
    deliveredAt: patch.deliveredAt ?? slot.deliveredAt ?? null,
    purchaseConfirmedAt: patch.purchaseConfirmedAt ?? slot.purchaseConfirmedAt ?? null,
  };
}

function persistMockSlot(slot: TimeSlotItem) {
  slotsStore = slotsStore.map((item) => (item.id === slot.id ? slot : item));
  persistSlots();
}

export async function deliverTimeSlot(
  slotId: string,
  deliveryUrl: string,
  actorUserId?: string | null,
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotItem | null>> {
  const id = normalizeSlotId(slotId);
  const url = deliveryUrl.trim();
  if (!isHttpUrl(url)) {
    return fail(null, '결과물 링크는 http(s) 주소여야 합니다.');
  }
  const current = await getTimeSlotById(id, client);
  const slot = current.data;
  if (!slot) {
    return fail(null, current.error ?? '크리에이터 상품을 찾을 수 없습니다.');
  }
  if (actorUserId && slot.creatorId && slot.creatorId !== actorUserId) {
    return fail(null, '본인 상품만 납품할 수 있습니다.');
  }
  if (!slot.winnerBidId || slot.status !== 'awarded') {
    return fail(null, '낙찰된 상품만 납품할 수 있습니다.');
  }
  if (slot.purchaseConfirmedAt) {
    return fail(null, '이미 구매 확정된 상품입니다.');
  }
  const deliveredAt = new Date().toISOString();
  const supabase = client ?? (await getDataClient());
  if (!supabase || !isUuid(id)) {
    const next = applyFulfillment(slot, { deliveryUrl: url, deliveredAt });
    persistMockSlot(next);
    return ok(next);
  }
  try {
    const { data, error } = await supabase
      .from('time_slots')
      .update({ delivery_url: url, delivered_at: deliveredAt })
      .eq('id', id)
      .select(SLOT_COLUMNS)
      .maybeSingle();
    if (error) {
      if (isSchemaMismatch(error)) {
        const next = applyFulfillment(slot, { deliveryUrl: url, deliveredAt });
        persistMockSlot(next);
        return ok(next);
      }
      return fail(null, UPDATE_FAIL_MESSAGE);
    }
    if (!data) {
      return fail(null, UPDATE_FAIL_MESSAGE);
    }
    return ok(applyFulfillment(mapSlot(data), { deliveryUrl: url, deliveredAt }));
  } catch {
    return fail(null, UPDATE_FAIL_MESSAGE);
  }
}

export async function confirmTimeSlotPurchase(
  slotId: string,
  actorUserId?: string | null,
  client?: SponsorAuctionClient | null,
): Promise<DataResult<TimeSlotItem | null>> {
  const id = normalizeSlotId(slotId);
  const current = await getTimeSlotById(id, client);
  const slot = current.data;
  if (!slot) {
    return fail(null, current.error ?? '크리에이터 상품을 찾을 수 없습니다.');
  }
  if (!slot.winnerBidId || slot.status !== 'awarded') {
    return fail(null, '낙찰된 상품만 구매 확정할 수 있습니다.');
  }
  if (!slot.deliveredAt && !slot.deliveryUrl) {
    return fail(null, '결과물이 납품된 뒤에 구매 확정할 수 있습니다.');
  }
  const bids = await listTimeSlotBids(id, client);
  const winner = bids.data.find((item) => item.id === slot.winnerBidId);
  if (!winner) {
    return fail(null, '선정된 제안을 찾을 수 없습니다.');
  }
  if (actorUserId && winner.advertiserId && winner.advertiserId !== actorUserId) {
    return fail(null, '선정된 광고주만 구매 확정할 수 있습니다.');
  }
  if (slot.purchaseConfirmedAt) {
    return ok(slot);
  }
  const confirmedAt = new Date().toISOString();
  const supabase = client ?? (await getDataClient());
  if (!supabase || !isUuid(id)) {
    const next = applyFulfillment(slot, { purchaseConfirmedAt: confirmedAt });
    persistMockSlot(next);
    return ok(next);
  }
  try {
    const { data, error } = await supabase
      .from('time_slots')
      .update({ purchase_confirmed_at: confirmedAt })
      .eq('id', id)
      .select(SLOT_COLUMNS)
      .maybeSingle();
    if (error) {
      if (isSchemaMismatch(error)) {
        const next = applyFulfillment(slot, { purchaseConfirmedAt: confirmedAt });
        persistMockSlot(next);
        return ok(next);
      }
      return fail(null, UPDATE_FAIL_MESSAGE);
    }
    if (!data) {
      return fail(null, UPDATE_FAIL_MESSAGE);
    }
    return ok(applyFulfillment(mapSlot(data), { purchaseConfirmedAt: confirmedAt }));
  } catch {
    return fail(null, UPDATE_FAIL_MESSAGE);
  }
}

