import { getSupabaseClient } from '@/lib/supabase/client';
import { formatWon } from '@/lib/utils';
import { pushNotification } from '@/lib/notifications';
import type { NotificationType } from '@/types/notification';
import { CHAT_INSERTED_EVENT, type ChatInsertedDetail, type RealtimeChange } from '@/types/realtime';

const seenKeys = new Set<string>();
const auctionOwnerCache = new Map<string, { authorId: string | null; title: string }>();
const slotOwnerCache = new Map<string, { creatorId: string | null; title: string }>();

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function rememberSeen(key: string) {
  if (seenKeys.has(key)) {
    return false;
  }
  seenKeys.add(key);
  if (seenKeys.size > 400) {
    const first = seenKeys.values().next().value;
    if (typeof first === 'string') {
      seenKeys.delete(first);
    }
  }
  return true;
}

function viewingPath(href: string) {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.location.pathname === href || window.location.pathname.startsWith(`${href}/`);
}

function emitInApp(input: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
}) {
  pushNotification({ ...input, toast: false });
  if (!viewingPath(input.href) && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('app:toast', {
        detail: { message: `${input.title}: ${input.body}`, variant: 'info' },
      }),
    );
  }
}

async function auctionMeta(auctionId: string) {
  const cached = auctionOwnerCache.get(auctionId);
  if (cached) {
    return cached;
  }
  const client = getSupabaseClient();
  if (!client) {
    const fallback = { authorId: null as string | null, title: '캠페인' };
    auctionOwnerCache.set(auctionId, fallback);
    return fallback;
  }
  try {
    const { data } = await client
      .from('auctions')
      .select('author_id, title')
      .eq('id', auctionId)
      .maybeSingle();
    const next = {
      authorId: asText(data?.author_id) || null,
      title: asText(data?.title) || '캠페인',
    };
    auctionOwnerCache.set(auctionId, next);
    return next;
  } catch {
    const fallback = { authorId: null as string | null, title: '캠페인' };
    return fallback;
  }
}

async function slotMeta(slotId: string) {
  const cached = slotOwnerCache.get(slotId);
  if (cached) {
    return cached;
  }
  const client = getSupabaseClient();
  if (!client) {
    const fallback = { creatorId: null as string | null, title: '인벤토리' };
    slotOwnerCache.set(slotId, fallback);
    return fallback;
  }
  try {
    const { data } = await client
      .from('time_slots')
      .select('creator_id, title')
      .eq('id', slotId)
      .maybeSingle();
    const next = {
      creatorId: asText(data?.creator_id) || null,
      title: asText(data?.title) || '인벤토리',
    };
    slotOwnerCache.set(slotId, next);
    return next;
  } catch {
    return { creatorId: null as string | null, title: '인벤토리' };
  }
}

export async function applyRealtimeChange(change: RealtimeChange, userId: string) {
  const id = asText(change.record.id);
  if (!id || !rememberSeen(`${change.table}:${change.eventType}:${id}:${asText(change.record.status)}`)) {
    return;
  }

  if (change.table === 'bids') {
    const auctionId = asText(change.record.auction_id);
    const creatorId = asText(change.record.creator_id);
    if (!auctionId) {
      return;
    }
    window.dispatchEvent(new Event('auctions:changed'));
    const meta = await auctionMeta(auctionId);
    const href = `/auctions/${auctionId}`;
    const status = asText(change.record.status);
    if (change.eventType === 'UPDATE' && status === 'selected' && creatorId === userId) {
      emitInApp({
        userId,
        type: 'award_complete',
        title: '낙찰 완료',
        body: `"${meta.title}" 제안이 선정되었습니다.`,
        href,
      });
      return;
    }
    if (change.eventType !== 'INSERT' || creatorId === userId) {
      return;
    }
    if (!meta.authorId || meta.authorId !== userId) {
      return;
    }
    const amount = asNumber(change.record.bid_amount);
    const name = asText(change.record.creator_name) || '크리에이터';
    emitInApp({
      userId,
      type: 'bid_received',
      title: '새 입찰',
      body: `"${meta.title}"에 ${name}님의 제안(${formatWon(amount)})이 도착했습니다.`,
      href,
    });
    return;
  }

  if (change.table === 'time_slot_bids') {
    const slotId = asText(change.record.time_slot_id);
    const advertiserId = asText(change.record.advertiser_id);
    if (!slotId) {
      return;
    }
    window.dispatchEvent(new Event('timeslots:changed'));
    if (change.eventType !== 'INSERT') {
      return;
    }
    if (advertiserId && advertiserId === userId) {
      return;
    }
    const meta = await slotMeta(slotId);
    if (!meta.creatorId || meta.creatorId !== userId) {
      return;
    }
    const amount = asNumber(change.record.bid_amount);
    const name = asText(change.record.advertiser_name) || '광고주';
    emitInApp({
      userId,
      type: 'timeslot_bid',
      title: '인벤토리 입찰',
      body: `"${meta.title}"에 ${name}님의 입찰(${formatWon(amount)})이 도착했습니다.`,
      href: `/inventory/${slotId}`,
    });
    return;
  }

  if (change.table !== 'chat_messages' || change.eventType === 'DELETE') {
    return;
  }

  const auctionId = asText(change.record.auction_id);
  const senderId = asText(change.record.sender_id) || null;
  if (!auctionId) {
    return;
  }

  const detail: ChatInsertedDetail = {
    auctionId,
    id,
    senderId,
    senderName: asText(change.record.sender_name) || '참여자',
    body: asText(change.record.body),
    createdAt: asText(change.record.created_at) || new Date().toISOString(),
  };
  window.dispatchEvent(new CustomEvent<ChatInsertedDetail>(CHAT_INSERTED_EVENT, { detail }));

  if (senderId && senderId === userId) {
    return;
  }
  if (change.eventType !== 'INSERT') {
    return;
  }

  emitInApp({
    userId,
    type: 'chat_message',
    title: '새 메시지',
    body: `${detail.senderName}: ${detail.body.slice(0, 80) || '채팅이 도착했습니다.'}`,
    href: `/auctions/${auctionId}`,
  });
}
