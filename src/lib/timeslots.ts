import { withExclusiveAction } from '@/lib/action-lock';
import {
  computeBidEngineStats,
  isDeadlinePassed,
  nextInventoryMinBid,
} from '@/lib/auction-engine';
import { attachScore, getCreatorScoresByIds } from '@/lib/creator-metrics';
import { isPlatformType } from '@/lib/platforms';
import { getDataClient } from '@/lib/supabase/data-client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { isUuid } from '@/lib/uuid';
import { VALIDATION, validateTimeSlotPayload } from '@/lib/validation';
import { maskOffPlatformContact, sanitizeUserText } from '@/utils/filter';
import type { DataResult } from '@/types/auction';
import type { Database } from '@/types/database';
import type {
  CreateTimeSlotInput,
  PlaceTimeSlotBidInput,
  TimeSlotBidItem,
  TimeSlotItem,
  TimeSlotStatus,
} from '@/types/timeslot';

const SLOT_COLUMNS =
  'id, creator_id, creator_name, title, platform, description, expected_views, starting_price, current_highest_bid, bids_count, slot_start, slot_end, deadline, status, winner_bid_id, created_at';

const SLOT_BID_COLUMNS =
  'id, time_slot_id, advertiser_id, advertiser_name, bid_amount, message, created_at';

const INSERT_FAIL_MESSAGE = '등록에 실패했습니다. 다시 시도해 주세요.';
const UPDATE_FAIL_MESSAGE = '변경에 실패했습니다. 다시 시도해 주세요.';

type SlotRow = Database['public']['Tables']['time_slots']['Row'];
type SlotBidRow = Database['public']['Tables']['time_slot_bids']['Row'];

const STORAGE_SLOTS = 'sponsor-auction-timeslots';
const STORAGE_BIDS = 'sponsor-auction-timeslot-bids';

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
    title: '주말 한강 피크닉 숏폼 1편 슬롯',
    platform: 'youtube_shorts',
    description:
      '토요일 오후 업로드 예정. 제품 언박싱+실사용 15초. 평균 조회수 42만, 예상 조회수 40만 회 슬롯입니다.',
    expectedViews: 400_000,
    startingPrice: 800_000,
    currentHighestBid: 920_000,
    bidsCount: 2,
    slotStart: '2026-10-25T14:00:00+09:00',
    slotEnd: '2026-10-25T16:00:00+09:00',
    deadline: '2026-10-24T18:00:00+09:00',
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
    description: '구독자 대상 루틴 영상에 브랜드 컷 20초를 넣을 수 있는 인벤토리입니다.',
    expectedViews: 80_000,
    startingPrice: 350_000,
    currentHighestBid: 0,
    bidsCount: 0,
    slotStart: '2026-10-28T20:00:00+09:00',
    slotEnd: '2026-10-28T22:00:00+09:00',
    deadline: '2026-10-27T23:59:59+09:00',
    status: 'open',
    winnerBidId: null,
    createdAt: '2026-10-19T09:30:00+09:00',
  },
  {
    id: 'slot-003',
    creatorId: 'usr-007',
    creatorName: '피부일기 하연',
    title: '7일 스킨케어 트래킹 릴스 슬롯',
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

export async function listTimeSlots(options?: {
  creatorId?: string;
}): Promise<DataResult<TimeSlotItem[]>> {
  const supabase = await getDataClient();
  if (!supabase || (options?.creatorId && !isUuid(options.creatorId))) {
    const filtered = slotsStore
      .map((item) => applySlotExpiry(item))
      .filter((item) => (options?.creatorId ? item.creatorId === options.creatorId : true));
    return ok(await withScores(filtered));
  }

  try {
    let query = supabase.from('time_slots').select(SLOT_COLUMNS).order('created_at', {
      ascending: false,
    });
    if (options?.creatorId && isUuid(options.creatorId)) {
      query = query.eq('creator_id', options.creatorId);
    }
    const { data, error } = await query;
    if (error) {
      if (isSchemaMismatch(error)) {
        const filtered = slotsStore
          .map((item) => applySlotExpiry(item))
          .filter((item) => (options?.creatorId ? item.creatorId === options.creatorId : true));
        return ok(await withScores(filtered));
      }
      return fail([], '타임슬롯 목록을 불러오지 못했습니다.');
    }
    const rows = (data ?? []).map((row) => mapSlot(row));
    if (rows.length === 0 && !options?.creatorId) {
      return ok(await withScores(slotsStore.map((item) => applySlotExpiry(item))));
    }
    return ok(await withScores(rows));
  } catch {
    return fail([], '타임슬롯 목록을 불러오지 못했습니다.');
  }
}

export async function getTimeSlotById(id: string): Promise<DataResult<TimeSlotItem | null>> {
  if (!id.trim()) {
    return fail(null, '타임슬롯 ID가 필요합니다.');
  }
  const supabase = await getDataClient();
  if (!supabase || !isUuid(id)) {
    const found = slotsStore.find((item) => item.id === id) ?? null;
    if (!found) {
      return fail(null, '타임슬롯을 찾을 수 없습니다.');
    }
    const [withScore] = await withScores([applySlotExpiry(found)]);
    return ok(withScore ?? applySlotExpiry(found));
  }

  try {
    const { data, error } = await supabase
      .from('time_slots')
      .select(SLOT_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) {
      const found = slotsStore.find((item) => item.id === id) ?? null;
      if (found) {
        const [withScore] = await withScores([applySlotExpiry(found)]);
        return ok(withScore ?? applySlotExpiry(found));
      }
      return fail(null, '타임슬롯을 찾을 수 없습니다.');
    }
    const [withScore] = await withScores([mapSlot(data)]);
    return ok(withScore ?? mapSlot(data));
  } catch {
    return fail(null, '타임슬롯을 불러오지 못했습니다.');
  }
}

export async function listTimeSlotBids(slotId: string): Promise<DataResult<TimeSlotBidItem[]>> {
  if (!slotId.trim()) {
    return fail([], '타임슬롯 ID가 필요합니다.');
  }
  const supabase = await getDataClient();
  if (!supabase || !isUuid(slotId)) {
    const bids = slotBidsStore
      .filter((item) => item.timeSlotId === slotId)
      .sort((left, right) => right.bidAmount - left.bidAmount);
    const leading = bids[0]?.bidAmount ?? 0;
    return ok(bids.map((item) => ({ ...item, isLeading: item.bidAmount === leading })));
  }

  try {
    const { data, error } = await supabase
      .from('time_slot_bids')
      .select(SLOT_BID_COLUMNS)
      .eq('time_slot_id', slotId)
      .order('bid_amount', { ascending: false });
    if (error) {
      if (isSchemaMismatch(error)) {
        const bids = slotBidsStore
          .filter((item) => item.timeSlotId === slotId)
          .sort((left, right) => right.bidAmount - left.bidAmount);
        const leading = bids[0]?.bidAmount ?? 0;
        return ok(bids.map((item) => ({ ...item, isLeading: item.bidAmount === leading })));
      }
      return fail([], '입찰 목록을 불러오지 못했습니다.');
    }
    const amounts = (data ?? []).map((row) => row.bid_amount ?? 0);
    const leading = computeBidEngineStats(amounts).highestBidAmount;
    return ok((data ?? []).map((row) => mapSlotBid(row, leading)));
  } catch {
    return fail([], '입찰 목록을 불러오지 못했습니다.');
  }
}

export async function createTimeSlot(
  input: CreateTimeSlotInput,
): Promise<DataResult<TimeSlotItem | null>> {
  const invalid = validateTimeSlotPayload(input);
  if (invalid) {
    return fail(null, invalid);
  }

  const supabase = await getDataClient();
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

  if (!supabase || !payload.creator_id) {
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
    slotsStore = [created, ...slotsStore];
    persistSlots();
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
      slotsStore = [created, ...slotsStore];
      persistSlots();
      const [withScore] = await withScores([created]);
      return ok(withScore ?? created);
    }
    const [withScore] = await withScores([mapSlot(data)]);
    return ok(withScore ?? mapSlot(data));
  } catch {
    return fail(null, INSERT_FAIL_MESSAGE);
  }
}

export async function closeTimeSlot(id: string, creatorId?: string | null) {
  const current = await getTimeSlotById(id);
  if (!current.data) {
    return fail(null, current.error ?? '타임슬롯을 찾을 수 없습니다.');
  }
  if (creatorId && current.data.creatorId && current.data.creatorId !== creatorId) {
    return fail(null, '본인 슬롯만 마감할 수 있습니다.');
  }
  const supabase = await getDataClient();
  if (!supabase || !isUuid(id)) {
    slotsStore = slotsStore.map((item) =>
      item.id === id ? { ...item, status: 'closed' as const } : item,
    );
    persistSlots();
    return getTimeSlotById(id);
  }
  try {
    const { data, error } = await supabase
      .from('time_slots')
      .update({ status: 'closed' })
      .eq('id', id)
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

export async function placeTimeSlotBid(
  input: PlaceTimeSlotBidInput,
): Promise<DataResult<TimeSlotBidItem | null>> {
  const lockKey = `slot-bid:${input.timeSlotId}:${(input.advertiserName ?? '').trim().toLowerCase()}`;
  return withExclusiveAction(lockKey, fail(null, VALIDATION.actionInFlight), async () => {
    const slotResult = await getTimeSlotById(input.timeSlotId);
    const slot = slotResult.data;
    if (!slot) {
      return fail(null, slotResult.error ?? '타임슬롯을 찾을 수 없습니다.');
    }
    const live = applySlotExpiry(slot);
    if (live.status !== 'open' || live.winnerBidId) {
      return fail(null, '마감된 타임슬롯에는 입찰할 수 없습니다.');
    }
    const minBid = nextInventoryMinBid(live.startingPrice, live.currentHighestBid);
    if (!Number.isFinite(input.bidAmount) || input.bidAmount < minBid) {
      return fail(null, `입찰가는 ${minBid.toLocaleString('ko-KR')}원 이상이어야 합니다.`);
    }
    let message = '';
    try {
      message = sanitizeUserText(input.message || '인벤토리 입찰', 'reject');
    } catch {
      return fail(null, VALIDATION.offPlatformContact);
    }

    const supabase = await getDataClient();
    if (!supabase || !isUuid(input.timeSlotId)) {
      const created: TimeSlotBidItem = {
        id: `slot-bid-${Date.now()}`,
        timeSlotId: input.timeSlotId,
        advertiserId: input.advertiserId ?? null,
        advertiserName: (input.advertiserName ?? '').trim() || '광고주',
        bidAmount: input.bidAmount,
        message,
        createdAt: new Date().toISOString(),
        isLeading: true,
      };
      slotBidsStore = [created, ...slotBidsStore];
      refreshMockSlotEngine(input.timeSlotId);
      persistSlots();
      return ok(created);
    }

    try {
      const { data, error } = await supabase
        .from('time_slot_bids')
        .insert({
          time_slot_id: input.timeSlotId,
          advertiser_id:
            input.advertiserId && isUuid(input.advertiserId) ? input.advertiserId : null,
          advertiser_name: (input.advertiserName ?? '').trim() || '광고주',
          bid_amount: input.bidAmount,
          message,
        })
        .select(SLOT_BID_COLUMNS)
        .single();
      if (error || !data) {
        return fail(null, INSERT_FAIL_MESSAGE);
      }
      return ok(mapSlotBid(data, input.bidAmount));
    } catch {
      return fail(null, INSERT_FAIL_MESSAGE);
    }
  });
}

export async function awardTimeSlotBid(
  slotId: string,
  bidId: string,
  creatorId?: string | null,
): Promise<DataResult<TimeSlotItem | null>> {
  const slotResult = await getTimeSlotById(slotId);
  const slot = slotResult.data;
  if (!slot) {
    return fail(null, slotResult.error ?? '타임슬롯을 찾을 수 없습니다.');
  }
  if (creatorId && slot.creatorId && slot.creatorId !== creatorId) {
    return fail(null, '본인 슬롯만 낙찰할 수 있습니다.');
  }
  if (slot.status !== 'open' || slot.winnerBidId) {
    return fail(null, '이미 마감된 타임슬롯입니다.');
  }

  const bids = await listTimeSlotBids(slotId);
  const winner = bids.data.find((item) => item.id === bidId);
  if (!winner) {
    return fail(null, '낙찰할 입찰을 찾을 수 없습니다.');
  }

  const supabase = await getDataClient();
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
      return fail(null, '이미 마감된 타임슬롯입니다.');
    }
    return ok(mapSlot(data));
  } catch {
    return fail(null, UPDATE_FAIL_MESSAGE);
  }
}

