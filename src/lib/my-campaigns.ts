import type { AuctionItem } from '@/types/auction';
import type { SessionUser } from '@/types/auth';

const STORAGE_KEY = 'sponsor-auction-mine';
const DEMO_CAMPAIGN_IDS = ['auc-001', 'auc-002', 'auc-004'];

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
}

export function getStoredAuctionIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }
    return asIdList(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function getMyAuctionIds(): string[] {
  const stored = getStoredAuctionIds();
  if (stored.length > 0) {
    return stored;
  }
  return [...DEMO_CAMPAIGN_IDS];
}

export function isMyAuction(id: string) {
  if (!id.trim()) {
    return false;
  }

  return getMyAuctionIds().includes(id.trim());
}

export function isOwnedAuction(
  auction: Pick<AuctionItem, 'id' | 'authorId' | 'authorName'> | null | undefined,
  user: Pick<SessionUser, 'id' | 'name'> | null | undefined,
) {
  if (!auction?.id || !user?.id) {
    return false;
  }
  if (auction.authorId && auction.authorId === user.id) {
    return true;
  }
  if (auction.authorName && user.name && auction.authorName === user.name) {
    return true;
  }
  return isMyAuction(auction.id);
}

export function rememberMyAuction(id: string) {
  if (typeof window === 'undefined' || !id.trim()) {
    return;
  }

  try {
    const next = Array.from(new Set([id.trim(), ...getMyAuctionIds()]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage를 쓸 수 없어도 상세 페이지에서 낙찰은 가능합니다.
  }
}
