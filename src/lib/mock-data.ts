import type {
  PayoutItem,
  ProfileItem,
  ProfileStatus,
} from '@/types/admin';
import { creatorPayoutAmount } from '@/lib/fees';
import { mergePayoutLists } from '@/lib/payouts';
import {
  isAuctionClosed,
  type AuctionItem,
  type AuctionStatus,
  type BidItem,
  type CreateAuctionInput,
  type CreateBidInput,
  type DataResult,
} from '@/types/auction';
import {
  VALIDATION,
  getAwardBlockReason,
  validateAuctionPayload,
  validateBidPayload,
} from '@/lib/validation';

export const mockAuctions: AuctionItem[] = [
  {
    id: 'auc-001',
    title: '여름 무알콜 맥주 숏폼 캠페인',
    platform: 'youtube_shorts',
    budget: 1_200_000,
    description:
      '20대 타깃 무알콜 맥주 신제품 론칭. 15초 내외 숏폼 1편 + 스토리 컷다운 1편. 제품 언박싱과 실제 시음 반응이 드러나면 가산점.',
    status: 'active',
    isBlind: false,
    authorId: null,
    authorName: '한강브루어리',
    winnerBidId: null,
    deadline: '2026-10-25T23:59:59+09:00',
    createdAt: '2026-10-08T11:20:00+09:00',
    bidsCount: 4,
  },
  {
    id: 'auc-002',
    title: '비건 스킨케어 릴스 리뷰',
    platform: 'instagram_reels',
    budget: 800_000,
    description:
      '민감성 피부 크리에이터 대상. 7일 사용 후기 릴스 1편. 성분 하이라이트와 전/후 피부 질감 클로즈업 필수.',
    status: 'active',
    isBlind: false,
    authorId: null,
    authorName: '아워피부랩',
    winnerBidId: null,
    deadline: '2026-10-20T18:00:00+09:00',
    createdAt: '2026-10-06T09:05:00+09:00',
    bidsCount: 2,
  },
  {
    id: 'auc-003',
    title: '러닝화 언박싱 틱톡 챌린지',
    platform: 'tiktok',
    budget: 2_500_000,
    description:
      '신작 쿠셔닝 러닝화 챌린지 사운드 사용. 도심 야간 러닝 컷 포함, 해시태그 3개 고정. 팔로워 5만 이상 우대.',
    status: 'closed',
    isBlind: false,
    authorId: null,
    authorName: '나이트스텝',
    winnerBidId: 'bid-004',
    deadline: '2026-10-18T23:59:59+09:00',
    createdAt: '2026-10-01T14:40:00+09:00',
    bidsCount: 8,
  },
  {
    id: 'auc-004',
    title: '핀테크 앱 X 스레드 체험단',
    platform: 'x_twitter',
    budget: 450_000,
    description:
      '해외송금 수수료 비교 스레드 1세트(5~8트윗). 스크린샷 실사용 인증 필요. 금융 고지 문구는 브랜드가 제공.',
    status: 'completed',
    isBlind: false,
    authorId: null,
    authorName: '페이플로우',
    winnerBidId: 'bid-005',
    deadline: '2026-09-30T23:59:59+09:00',
    createdAt: '2026-09-12T10:00:00+09:00',
    bidsCount: 4,
  },
  {
    id: 'auc-005',
    title: '로컬 카페 브이로그 스폰서십',
    platform: 'other',
    budget: 300_000,
    description:
      '성수동 신규 카페 오프닝. 블로그/네이버 클립/유튜브 롱폼 중 택1. 메뉴 3종 시식과 인테리어 워크스루 포함.',
    status: 'cancelled',
    isBlind: true,
    authorId: null,
    authorName: '성수빈커피',
    winnerBidId: null,
    deadline: '2026-10-15T12:00:00+09:00',
    createdAt: '2026-10-03T16:15:00+09:00',
    bidsCount: 0,
  },
];

export const mockBids: BidItem[] = [
  {
    id: 'bid-001',
    auctionId: 'auc-001',
    creatorId: 'usr-006',
    creatorName: '민지쇼츠',
    creatorChannelUrl: 'https://www.youtube.com/@minjishorts',
    bidAmount: 980_000,
    proposalText:
      '주말 한강 피크닉 콘셉트로 무알콜 맥주를 메인 소품으로 씁니다. 기존 평균 조회수 42만, CTR 8.1%입니다.',
    status: 'pending',
    createdAt: '2026-10-09T08:12:00+09:00',
  },
  {
    id: 'bid-002',
    auctionId: 'auc-001',
    creatorId: null,
    creatorName: '야식런치',
    creatorChannelUrl: 'https://www.youtube.com/@yashiklunch',
    bidAmount: 1_050_000,
    proposalText:
      '편의점 야식 조합 시리즈에 신제품을 넣어 A/B 훅 2종을 테스트하겠습니다. 댓글 이벤트도 함께 제안합니다.',
    status: 'pending',
    createdAt: '2026-10-09T21:44:00+09:00',
  },
  {
    id: 'bid-003',
    auctionId: 'auc-002',
    creatorId: 'usr-007',
    creatorName: '피부일기 하연',
    creatorChannelUrl: 'https://www.instagram.com/skindiary.hayeon',
    bidAmount: 720_000,
    proposalText:
      '민감성 피부 루틴에 7일 트래킹 그리드를 넣고, 성분표 오버레이로 신뢰도를 높이겠습니다.',
    status: 'pending',
    createdAt: '2026-10-07T13:05:00+09:00',
  },
  {
    id: 'bid-004',
    auctionId: 'auc-003',
    creatorId: 'usr-008',
    creatorName: '나이트러너 준',
    creatorChannelUrl: 'https://www.tiktok.com/@nightrunner.jun',
    bidAmount: 2_100_000,
    proposalText:
      '한강 야간 러닝 + 오르막 테스트 컷. 챌린지 사운드에 맞춰 발 착지 슬로모션을 넣을 수 있습니다.',
    status: 'selected',
    createdAt: '2026-10-04T19:30:00+09:00',
  },
  {
    id: 'bid-005',
    auctionId: 'auc-004',
    creatorId: 'usr-demo-creator',
    creatorName: '머니노트 세린',
    creatorChannelUrl: 'https://x.com/moneynote_serin',
    bidAmount: 390_000,
    proposalText:
      '실제 송금 플로우를 단계별로 캡처해 수수료 비교 스레드를 작성합니다. 팔로워 중 해외거주 비율이 높습니다.',
    status: 'selected',
    createdAt: '2026-09-15T11:18:00+09:00',
  },
  {
    id: 'bid-demo-pending',
    auctionId: 'auc-001',
    creatorId: 'usr-demo-creator',
    creatorName: '데모 크리에이터',
    creatorChannelUrl: 'https://www.youtube.com/@demo-creator',
    bidAmount: 880_000,
    proposalText:
      '데모 계정으로 제출한 진행 중 제안입니다. 한강 피크닉 콘셉트 숏폼 1편을 제안합니다.',
    status: 'pending',
    createdAt: '2026-10-10T09:30:00+09:00',
  },
];

export const mockProfiles: ProfileItem[] = [
  {
    id: 'usr-001',
    name: '한강브루어리',
    email: 'brand@hangangbrewery.com',
    role: 'advertiser',
    status: 'active',
    createdAt: '2026-09-02T09:10:00+09:00',
  },
  {
    id: 'usr-002',
    name: '아워피부랩',
    email: 'hello@ourskinlab.com',
    role: 'advertiser',
    status: 'active',
    createdAt: '2026-09-08T14:22:00+09:00',
  },
  {
    id: 'usr-003',
    name: '나이트스텝',
    email: 'ads@nightstep.kr',
    role: 'advertiser',
    status: 'active',
    createdAt: '2026-09-18T11:40:00+09:00',
  },
  {
    id: 'usr-004',
    name: '페이플로우',
    email: 'campaigns@payflow.io',
    role: 'advertiser',
    status: 'suspended',
    createdAt: '2026-08-21T16:05:00+09:00',
  },
  {
    id: 'usr-005',
    name: '성수빈커피',
    email: 'owner@seongsubin.coffee',
    role: 'advertiser',
    status: 'active',
    createdAt: '2026-10-01T10:12:00+09:00',
  },
  {
    id: 'usr-006',
    name: '민지쇼츠',
    email: 'minji@shorts.creator',
    role: 'creator',
    status: 'active',
    createdAt: '2026-07-14T08:30:00+09:00',
  },
  {
    id: 'usr-007',
    name: '피부일기 하연',
    email: 'hayeon@skindiary.kr',
    role: 'creator',
    status: 'active',
    createdAt: '2026-08-03T19:18:00+09:00',
  },
  {
    id: 'usr-008',
    name: '나이트러너 준',
    email: 'jun@nightrunner.kr',
    role: 'creator',
    status: 'active',
    createdAt: '2026-08-27T07:55:00+09:00',
  },
  {
    id: 'usr-009',
    name: '머니노트 세린',
    email: 'serin@moneynote.x',
    role: 'creator',
    status: 'suspended',
    createdAt: '2026-09-05T13:47:00+09:00',
  },
];

export const mockPayouts: PayoutItem[] = [
  {
    id: 'pay-001',
    creatorId: 'usr-006',
    creatorName: '민지쇼츠',
    creatorEmail: 'minji@shorts.creator',
    amount: 833_000,
    status: 'pending',
    auctionTitle: '여름 무알콜 맥주 숏폼 캠페인',
    requestedAt: '2026-10-11T09:20:00+09:00',
  },
  {
    id: 'pay-002',
    creatorId: 'usr-007',
    creatorName: '피부일기 하연',
    creatorEmail: 'hayeon@skindiary.kr',
    amount: 612_000,
    status: 'pending',
    auctionTitle: '비건 스킨케어 릴스 리뷰',
    requestedAt: '2026-10-10T18:05:00+09:00',
  },
  {
    id: 'pay-003',
    creatorId: 'usr-008',
    creatorName: '나이트러너 준',
    creatorEmail: 'jun@nightrunner.kr',
    amount: 1_785_000,
    status: 'pending',
    auctionTitle: '러닝화 언박싱 틱톡 챌린지',
    requestedAt: '2026-10-08T12:44:00+09:00',
  },
  {
    id: 'pay-004',
    creatorId: 'usr-009',
    creatorName: '머니노트 세린',
    creatorEmail: 'serin@moneynote.x',
    amount: 331_500,
    status: 'paid',
    auctionTitle: '핀테크 앱 X 스레드 체험단',
    requestedAt: '2026-09-28T15:10:00+09:00',
  },
  {
    id: 'pay-005',
    creatorId: 'usr-006',
    creatorName: '민지쇼츠',
    creatorEmail: 'minji@shorts.creator',
    amount: 255_000,
    status: 'paid',
    auctionTitle: '로컬 카페 브이로그 스폰서십',
    requestedAt: '2026-09-22T11:36:00+09:00',
  },
];

const AUCTIONS_STORAGE_KEY = 'sponsor-auction-mock-auctions';
const BIDS_STORAGE_KEY = 'sponsor-auction-mock-bids';
const PROFILES_STORAGE_KEY = 'sponsor-auction-mock-profiles';
const PAYOUTS_STORAGE_KEY = 'sponsor-auction-mock-payouts';

function readPersistedList<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') {
    return [...fallback];
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [...fallback];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as T[]) : [...fallback];
  } catch {
    return [...fallback];
  }
}

function persistCampaignStores() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(AUCTIONS_STORAGE_KEY, JSON.stringify(auctionsStore));
    window.localStorage.setItem(BIDS_STORAGE_KEY, JSON.stringify(bidsStore));
  } catch {
    // 저장 실패해도 이번 세션 메모리 값은 유지합니다.
  }
}

function persistAdminStores() {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(PROFILES_STORAGE_KEY, JSON.stringify(profilesStore));
    window.localStorage.setItem(PAYOUTS_STORAGE_KEY, JSON.stringify(payoutsStore));
  } catch {
    // 저장 실패해도 이번 세션 메모리 값은 유지합니다.
  }
}

let auctionsStore: AuctionItem[] = readPersistedList(AUCTIONS_STORAGE_KEY, mockAuctions);
let bidsStore: BidItem[] = readPersistedList(BIDS_STORAGE_KEY, mockBids);
let profilesStore: ProfileItem[] = readPersistedList(PROFILES_STORAGE_KEY, mockProfiles);
let payoutsStore: PayoutItem[] = readPersistedList(PAYOUTS_STORAGE_KEY, mockPayouts);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function guardAuctionList(items: unknown): AuctionItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.filter((item): item is AuctionItem => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const auction = item as Partial<AuctionItem>;
    return (
      isNonEmptyString(auction.id) &&
      isNonEmptyString(auction.title) &&
      isNonEmptyString(auction.platform) &&
      isFiniteNumber(auction.budget) &&
      isNonEmptyString(auction.description) &&
      isNonEmptyString(auction.status) &&
      isNonEmptyString(auction.deadline) &&
      isNonEmptyString(auction.createdAt) &&
      isFiniteNumber(auction.bidsCount)
    );
  });
}

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

export async function getAuctions(): Promise<DataResult<AuctionItem[]>> {
  try {
    const auctions = guardAuctionList(auctionsStore);

    if (auctions.length === 0) {
      return fail([], '등록된 경매가 없습니다.');
    }

    return ok(auctions);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '경매 목록을 불러오지 못했습니다.';
    return fail([], message);
  }
}

export async function getAuctionById(
  id: string,
): Promise<DataResult<AuctionItem | null>> {
  try {
    if (!isNonEmptyString(id)) {
      return fail(null, '유효한 경매 ID가 필요합니다.');
    }

    const auctions = guardAuctionList(auctionsStore);
    const auction = auctions.find((item) => item.id === id) ?? null;

    if (!auction) {
      return fail(null, '해당 경매를 찾을 수 없습니다.');
    }

    return ok(auction);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '경매 정보를 불러오지 못했습니다.';
    return fail(null, message);
  }
}

export async function createAuction(
  data: CreateAuctionInput,
): Promise<DataResult<AuctionItem | null>> {
  try {
    if (!data || typeof data !== 'object') {
      return fail(null, '경매 데이터가 필요합니다.');
    }

    if (!isNonEmptyString(data.platform)) {
      return fail(null, '플랫폼을 선택해 주세요.');
    }

    const auctionError = validateAuctionPayload({
      title: data.title ?? '',
      budget: data.budget,
      description: data.description ?? '',
      deadline: data.deadline ?? '',
    });
    if (auctionError) {
      return fail(null, auctionError);
    }

    const created: AuctionItem = {
      id: `auc-${Date.now()}`,
      title: data.title.trim(),
      platform: data.platform,
      budget: data.budget,
      description: data.description.trim(),
      status: data.status ?? 'active',
      isBlind: data.isBlind ?? false,
      authorId: data.authorId ?? null,
      authorName: data.authorName?.trim() || '미상',
      winnerBidId: data.winnerBidId ?? null,
      deadline: data.deadline,
      createdAt: new Date().toISOString(),
      bidsCount: 0,
    };

    auctionsStore = [created, ...auctionsStore];
    persistCampaignStores();
    return ok(created);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '경매를 생성하지 못했습니다.';
    return fail(null, message);
  }
}

export async function createBid(
  data: CreateBidInput,
): Promise<DataResult<BidItem | null>> {
  try {
    if (!data || typeof data !== 'object') {
      return fail(null, '입찰 데이터가 필요합니다.');
    }

    if (!isNonEmptyString(data.auctionId)) {
      return fail(null, '경매 ID가 필요합니다.');
    }

    if (!isNonEmptyString(data.creatorName)) {
      return fail(null, '크리에이터 이름을 입력해 주세요.');
    }

    if (!isNonEmptyString(data.creatorChannelUrl)) {
      return fail(null, '채널 URL을 입력해 주세요.');
    }

    const auction = auctionsStore.find((item) => item.id === data.auctionId);
    if (!auction) {
      return fail(null, '해당 경매를 찾을 수 없습니다.');
    }

    const bidError = validateBidPayload({
      bidAmount: data.bidAmount,
      proposalText: data.proposalText ?? '',
      creatorChannelUrl: data.creatorChannelUrl ?? '',
      auctionBudget: auction.budget,
      auctionStatus: auction.status,
      isBlind: auction.isBlind,
      winnerBidId: auction.winnerBidId,
    });
    if (bidError) {
      return fail(null, bidError);
    }

    const alreadyBid = bidsStore.some(
      (item) =>
        item.auctionId === data.auctionId &&
        item.creatorName.trim().toLowerCase() === data.creatorName.trim().toLowerCase(),
    );
    if (alreadyBid) {
      return fail(null, VALIDATION.duplicateBid);
    }

    const created: BidItem = {
      id: `bid-${Date.now()}`,
      auctionId: data.auctionId,
      creatorId: data.creatorId ?? null,
      creatorName: data.creatorName.trim(),
      creatorChannelUrl: data.creatorChannelUrl.trim(),
      bidAmount: data.bidAmount,
      proposalText: data.proposalText.trim(),
      status: data.status ?? 'pending',
      createdAt: new Date().toISOString(),
    };

    bidsStore = [created, ...bidsStore];

    auctionsStore = auctionsStore.map((auction) =>
      auction.id === created.auctionId
        ? { ...auction, bidsCount: auction.bidsCount + 1 }
        : auction,
    );
    persistCampaignStores();

    return ok(created);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '입찰을 등록하지 못했습니다.';
    return fail(null, message);
  }
}

function guardBidList(items: unknown): BidItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.filter((item): item is BidItem => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const bid = item as Partial<BidItem>;
    return (
      isNonEmptyString(bid.id) &&
      isNonEmptyString(bid.auctionId) &&
      isNonEmptyString(bid.creatorName) &&
      isNonEmptyString(bid.creatorChannelUrl) &&
      isFiniteNumber(bid.bidAmount) &&
      isNonEmptyString(bid.proposalText) &&
      isNonEmptyString(bid.createdAt) &&
      (bid.status === undefined ||
        bid.status === 'pending' ||
        bid.status === 'selected')
    );
  });
}

export async function getBidsByCreator(
  userId: string,
  options?: { creatorName?: string; bidIds?: string[] },
): Promise<DataResult<BidItem[]>> {
  try {
    const creatorId = userId.trim();
    const creatorName = options?.creatorName?.trim() ?? '';
    const bidIds = new Set((options?.bidIds ?? []).filter((id) => id.trim().length > 0));
    const bids = guardBidList(bidsStore).filter((item) => {
      if (creatorId && item.creatorId === creatorId) {
        return true;
      }
      if (creatorName && item.creatorName === creatorName) {
        return true;
      }
      return bidIds.has(item.id);
    });
    return ok(bids);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '제안 목록을 불러오지 못했습니다.';
    return fail([], message);
  }
}

export async function getBids(): Promise<DataResult<BidItem[]>> {
  try {
    const bids = guardBidList(bidsStore);
    if (bids.length === 0) {
      return fail([], '등록된 입찰이 없습니다.');
    }

    return ok(bids);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '입찰 목록을 불러오지 못했습니다.';
    return fail([], message);
  }
}

export async function getBidsByAuctionId(
  auctionId: string,
): Promise<DataResult<BidItem[]>> {
  try {
    if (!isNonEmptyString(auctionId)) {
      return fail([], '유효한 경매 ID가 필요합니다.');
    }

    const bids = guardBidList(bidsStore)
      .filter((item) => item.auctionId === auctionId)
      .map((item) => ({
        ...item,
        status: (item.status === 'selected' ? 'selected' : 'pending') as BidItem['status'],
      }));
    return ok(bids);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '제안 목록을 불러오지 못했습니다.';
    return fail([], message);
  }
}

export async function awardBid(
  auctionId: string,
  bidId: string,
): Promise<DataResult<AuctionItem | null>> {
  try {
    if (!isNonEmptyString(auctionId) || !isNonEmptyString(bidId)) {
      return fail(null, '유효한 경매/제안 ID가 필요합니다.');
    }

    const auction = auctionsStore.find((item) => item.id === auctionId);
    if (!auction) {
      return fail(null, '해당 경매를 찾을 수 없습니다.');
    }

    const awardBlocked = getAwardBlockReason(auction);
    if (awardBlocked) {
      return fail(null, awardBlocked);
    }

    const bid = bidsStore.find(
      (item) => item.id === bidId && item.auctionId === auctionId,
    );
    if (!bid) {
      return fail(null, '해당 제안을 찾을 수 없습니다.');
    }

    if (bid.status === 'selected') {
      return fail(null, VALIDATION.alreadyAwarded);
    }

    bidsStore = bidsStore.map((item) => {
      if (item.auctionId !== auctionId) {
        return item;
      }

      return {
        ...item,
        status: item.id === bid.id ? 'selected' : item.status,
      };
    });

    const updated: AuctionItem = {
      ...auction,
      status: 'closed',
      winnerBidId: bid.id,
    };
    auctionsStore = auctionsStore.map((item) =>
      item.id === auctionId ? updated : item,
    );
    persistCampaignStores();
    return ok(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '낙찰을 처리하지 못했습니다.';
    return fail(null, message);
  }
}

export async function deleteAuction(
  id: string,
): Promise<DataResult<boolean>> {
  try {
    if (!isNonEmptyString(id)) {
      return fail(false, '유효한 경매 ID가 필요합니다.');
    }

    const exists = auctionsStore.some((item) => item.id === id);
    if (!exists) {
      return fail(false, '해당 경매를 찾을 수 없습니다.');
    }

    auctionsStore = auctionsStore.filter((item) => item.id !== id);
    bidsStore = bidsStore.filter((item) => item.auctionId !== id);
    persistCampaignStores();
    return ok(true);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '경매를 삭제하지 못했습니다.';
    return fail(false, message);
  }
}

export async function updateAuctionStatus(
  id: string,
  status: AuctionStatus,
): Promise<DataResult<AuctionItem | null>> {
  try {
    if (!isNonEmptyString(id)) {
      return fail(null, '유효한 경매 ID가 필요합니다.');
    }

    const current = auctionsStore.find((item) => item.id === id);
    if (!current) {
      return fail(null, '해당 경매를 찾을 수 없습니다.');
    }

    const updated: AuctionItem = { ...current, status };
    auctionsStore = auctionsStore.map((item) =>
      item.id === id ? updated : item,
    );
    persistCampaignStores();
    return ok(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '상태를 변경하지 못했습니다.';
    return fail(null, message);
  }
}

export async function updateAuctionBlind(
  id: string,
  isBlind: boolean,
): Promise<DataResult<AuctionItem | null>> {
  try {
    if (!isNonEmptyString(id)) {
      return fail(null, '유효한 경매 ID가 필요합니다.');
    }

    const current = auctionsStore.find((item) => item.id === id);
    if (!current) {
      return fail(null, '해당 경매를 찾을 수 없습니다.');
    }

    if (current.isBlind === isBlind) {
      return fail(null, isBlind ? VALIDATION.blindAlready : VALIDATION.unblindAlready);
    }

    const updated: AuctionItem = { ...current, isBlind };
    auctionsStore = auctionsStore.map((item) =>
      item.id === id ? updated : item,
    );
    persistCampaignStores();
    return ok(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '블라인드를 변경하지 못했습니다.';
    return fail(null, message);
  }
}

function guardProfileList(items: unknown): ProfileItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.filter((item): item is ProfileItem => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const profile = item as Partial<ProfileItem>;
    return (
      isNonEmptyString(profile.id) &&
      isNonEmptyString(profile.name) &&
      isNonEmptyString(profile.email) &&
      isNonEmptyString(profile.role) &&
      isNonEmptyString(profile.status) &&
      isNonEmptyString(profile.createdAt)
    );
  });
}

function guardPayoutList(items: unknown): PayoutItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  return items.filter((item): item is PayoutItem => {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const payout = item as Partial<PayoutItem>;
    return (
      isNonEmptyString(payout.id) &&
      isNonEmptyString(payout.creatorId) &&
      isNonEmptyString(payout.creatorName) &&
      isNonEmptyString(payout.creatorEmail) &&
      isFiniteNumber(payout.amount) &&
      isNonEmptyString(payout.status) &&
      isNonEmptyString(payout.auctionTitle) &&
      isNonEmptyString(payout.requestedAt)
    );
  });
}

export async function getProfiles(): Promise<DataResult<ProfileItem[]>> {
  try {
    const profiles = guardProfileList(profilesStore);
    if (profiles.length === 0) {
      return fail([], '등록된 회원이 없습니다.');
    }

    return ok(profiles);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '회원 목록을 불러오지 못했습니다.';
    return fail([], message);
  }
}

export async function updateProfileStatus(
  id: string,
  status: ProfileStatus,
): Promise<DataResult<ProfileItem | null>> {
  try {
    if (!isNonEmptyString(id)) {
      return fail(null, '유효한 회원 ID가 필요합니다.');
    }

    const current = profilesStore.find((item) => item.id === id);
    if (!current) {
      return fail(null, '해당 회원을 찾을 수 없습니다.');
    }

    if (current.role === 'admin') {
      return fail(null, '관리자 계정은 제재할 수 없습니다.');
    }

    if (current.status === status) {
      return fail(null, VALIDATION.sanctionAlready);
    }

    const updated: ProfileItem = { ...current, status };
    profilesStore = profilesStore.map((item) =>
      item.id === id ? updated : item,
    );
    persistAdminStores();
    return ok(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '회원 상태를 변경하지 못했습니다.';
    return fail(null, message);
  }
}

function payoutsFromClosedCampaigns(): PayoutItem[] {
  const auctions = guardAuctionList(auctionsStore);
  const bids = Array.isArray(bidsStore) ? bidsStore : [];

  const items: PayoutItem[] = [];

  for (const auction of auctions) {
    if (!isAuctionClosed(auction.status)) {
      continue;
    }

    const bid =
      bids.find((item) => item.id === auction.winnerBidId && item.auctionId === auction.id) ??
      bids.find((item) => item.auctionId === auction.id && item.status === 'selected');
    if (!bid) {
      continue;
    }

    const amount = creatorPayoutAmount(bid.bidAmount);
    if (amount <= 0) {
      continue;
    }

    items.push({
      id: `payout-auction-${auction.id}`,
      creatorId: bid.creatorId ?? bid.id,
      creatorName: bid.creatorName,
      creatorEmail: `${bid.creatorName.replace(/\s+/g, '').toLowerCase()}@creator.local`,
      amount,
      status: auction.status === 'completed' ? 'paid' : 'pending',
      auctionTitle: auction.title,
      requestedAt: auction.createdAt,
      auctionId: auction.id,
      bidId: bid.id,
    });
  }

  return items;
}

export async function getPayouts(): Promise<DataResult<PayoutItem[]>> {
  try {
    const payouts = mergePayoutLists(
      guardPayoutList(payoutsStore),
      payoutsFromClosedCampaigns(),
    );
    if (payouts.length === 0) {
      return fail([], '정산 요청이 없습니다.');
    }

    return ok(payouts);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '정산 목록을 불러오지 못했습니다.';
    return fail([], message);
  }
}

export async function approvePayout(
  id: string,
): Promise<DataResult<PayoutItem | null>> {
  try {
    if (!isNonEmptyString(id)) {
      return fail(null, '유효한 정산 ID가 필요합니다.');
    }

    const current =
      payoutsStore.find((item) => item.id === id) ??
      payoutsFromClosedCampaigns().find((item) => item.id === id);
    if (!current) {
      return fail(null, '해당 정산 요청을 찾을 수 없습니다.');
    }

    if (current.status === 'paid') {
      return fail(null, VALIDATION.payoutAlready);
    }

    const updated: PayoutItem = {
      ...current,
      status: 'paid',
      paidAt: new Date().toISOString(),
    };
    if (payoutsStore.some((item) => item.id === id)) {
      payoutsStore = payoutsStore.map((item) =>
        item.id === id ? updated : item,
      );
    } else {
      payoutsStore = [...payoutsStore, updated];
    }
    persistAdminStores();
    return ok(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '정산 승인을 처리하지 못했습니다.';
    return fail(null, message);
  }
}
