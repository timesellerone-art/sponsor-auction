import type { AppNotification, NotificationType } from '@/types/notification';

const STORAGE_KEY = 'sponsor-auction-notifications';
const OWNERS_KEY = 'sponsor-auction-owners';
const CHANGED_EVENT = 'notifications:changed';
const SESSION_KEY = 'sponsor-auction-auth-session';
const DEMO_ADVERTISER_ID = 'usr-demo-advertiser';
const SEED_OWNER_IDS = new Set(['auc-001', 'auc-002']);

function nowIso() {
  return new Date().toISOString();
}

function asNotification(value: unknown): AppNotification | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Partial<AppNotification>;
  if (
    typeof item.id !== 'string' ||
    typeof item.userId !== 'string' ||
    typeof item.title !== 'string' ||
    typeof item.body !== 'string' ||
    typeof item.href !== 'string' ||
    typeof item.createdAt !== 'string' ||
    typeof item.read !== 'boolean'
  ) {
    return null;
  }
  return {
    id: item.id,
    userId: item.userId,
    type:
      item.type === 'award_complete' ||
      item.type === 'payment_complete' ||
      item.type === 'chat_message' ||
      item.type === 'timeslot_bid'
        ? item.type
        : 'bid_received',
    title: item.title,
    body: item.body,
    href: item.href,
    read: item.read,
    createdAt: item.createdAt,
  };
}

function readAll(): AppNotification[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(asNotification).filter((item): item is AppNotification => item !== null);
  } catch {
    return [];
  }
}

function writeAll(items: AppNotification[]) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, 200)));
  } catch {
    // 저장 실패해도 이번 세션 안내는 토스트로 전달합니다.
  }
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function rememberAuctionOwner(auctionId: string, userId: string | null | undefined) {
  if (typeof window === 'undefined' || !auctionId.trim() || !userId?.trim()) {
    return;
  }
  try {
    const raw = window.localStorage.getItem(OWNERS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[auctionId.trim()] = userId.trim();
    window.localStorage.setItem(OWNERS_KEY, JSON.stringify(map));
  } catch {
    // 소유자 매핑이 없어도 데모 광고주에게 알림을 보낼 수 있습니다.
  }
}

export function getAuctionOwnerId(auctionId: string, authorId?: string | null) {
  if (authorId?.trim()) {
    return authorId.trim();
  }
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(OWNERS_KEY);
      const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      if (typeof map[auctionId] === 'string' && map[auctionId].trim()) {
        return map[auctionId].trim();
      }
    } catch {
      // fall through
    }
  }
  if (SEED_OWNER_IDS.has(auctionId)) {
    return DEMO_ADVERTISER_ID;
  }
  return null;
}

function currentUserId() {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { id?: string };
    return typeof parsed.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

export function listNotifications(userId: string | null | undefined) {
  if (!userId) {
    return [];
  }
  return readAll()
    .filter((item) => item.userId === userId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function unreadCount(userId: string | null | undefined) {
  return listNotifications(userId).filter((item) => !item.read).length;
}

export function markNotificationsRead(userId: string) {
  const next = readAll().map((item) =>
    item.userId === userId ? { ...item, read: true } : item,
  );
  writeAll(next);
}

export function markNotificationRead(id: string) {
  const next = readAll().map((item) => (item.id === id ? { ...item, read: true } : item));
  writeAll(next);
}

export function onNotificationsChanged(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  window.addEventListener(CHANGED_EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(CHANGED_EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function pushNotification(input: {
  userId: string | null | undefined;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  toast?: boolean;
}) {
  if (!input.userId?.trim()) {
    return;
  }

  const item: AppNotification = {
    id: `ntf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: input.userId.trim(),
    type: input.type,
    title: input.title,
    body: input.body,
    href: input.href,
    read: false,
    createdAt: nowIso(),
  };

  writeAll([item, ...readAll()]);

  if (input.toast !== false && currentUserId() === item.userId) {
    window.dispatchEvent(
      new CustomEvent('app:toast', {
        detail: { message: `${item.title}: ${item.body}`, variant: 'success' },
      }),
    );
  }
}
