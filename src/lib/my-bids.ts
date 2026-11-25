import { getBidsByCreator } from '@/lib/auctions';
import type { BidItem, BidStatus } from '@/types/auction';

const STORAGE_KEY = 'sponsor-auction-my-bids';

function isActiveBidStatus(status: BidStatus | string | null | undefined) {
  return status !== 'cancelled' && status !== 'rejected' && status !== 'withdrawn';
}

export function hasActiveCreatorBid(
  bids: Array<Pick<BidItem, 'auctionId' | 'creatorId' | 'status'>>,
  creatorId: string | null | undefined,
  auctionId?: string | null,
) {
  const uid = (creatorId ?? '').trim();
  const campaignId = (auctionId ?? '').trim();
  if (!uid) {
    return false;
  }
  return bids.some(
    (bid) =>
      bid.creatorId === uid &&
      isActiveBidStatus(bid.status) &&
      (!campaignId || bid.auctionId === campaignId),
  );
}

let myAuctionIdsCache: { userId: string; auctionIds: Set<string> } | null = null;
let myAuctionIdsInflight: { userId: string; promise: Promise<Set<string>> } | null = null;

export async function loadMyProposedAuctionIds(userId: string) {
  const id = userId.trim();
  if (!id) {
    return new Set<string>();
  }
  if (myAuctionIdsCache?.userId === id) {
    return myAuctionIdsCache.auctionIds;
  }
  if (myAuctionIdsInflight?.userId === id) {
    return myAuctionIdsInflight.promise;
  }
  const promise = getBidsByCreator(id).then((result) => {
    const auctionIds = new Set(
      (result.data ?? [])
        .filter((bid) => bid.creatorId === id && isActiveBidStatus(bid.status))
        .map((bid) => bid.auctionId)
        .filter(Boolean),
    );
    myAuctionIdsCache = { userId: id, auctionIds };
    myAuctionIdsInflight = null;
    return auctionIds;
  });
  myAuctionIdsInflight = { userId: id, promise };
  return promise;
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (item): item is string => typeof item === 'string' && item.trim().length > 0,
  );
}

export function getMyBidIds(): string[] {
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

export function rememberMyBid(id: string) {
  myAuctionIdsCache = null;
  myAuctionIdsInflight = null;
  if (typeof window === 'undefined' || !id.trim()) {
    return;
  }
  try {
    const next = Array.from(new Set([id.trim(), ...getMyBidIds()]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 저장에 실패해도 제안 자체는 이미 등록된 상태입니다.
  }
}
