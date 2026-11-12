import { remainingDeadlineMs } from '@/lib/auction-engine';
import { PLATFORM_LABELS } from '@/lib/platforms';
import type { AuctionItem, AuctionStatus, PlatformType } from '@/types/auction';

export type BrowseCategoryFilter =
  | 'all'
  | 'beauty'
  | 'food'
  | 'tech'
  | 'living'
  | 'pet'
  | 'fitness';

export const CAMPAIGN_CATEGORIES: { id: BrowseCategoryFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'beauty', label: '뷰티·패션' },
  { id: 'food', label: '푸드·카페' },
  { id: 'tech', label: '테크·앱' },
  { id: 'living', label: '리빙·인테리어' },
  { id: 'pet', label: '반려동물' },
  { id: 'fitness', label: '헬스·운동' },
];

const CATEGORY_KEYWORDS: Record<Exclude<BrowseCategoryFilter, 'all'>, string[]> = {
  pet: ['반려동물', '강아지', '고양이', '펫', '독', 'dog', 'cat'],
  beauty: ['시카', '앰플', '세럼', '스킨', '뷰티', '패션', '화장품', '비건', '피부'],
  fitness: ['헬스', '운동', '러닝', '피트니스', '요가', '러닝화'],
  food: ['그래놀라', '푸드', '카페', '맥주', '맛집', '베이커리', '음식', '커피'],
  living: ['리빙', '인테리어', '홈스타일', '공간'],
  tech: ['가계부', '핀테크', '앱', '테크', '언박싱', '스마트폰', '송금'],
};

const CATEGORY_COVERS: Record<Exclude<BrowseCategoryFilter, 'all'> | 'default', string[]> = {
  beauty: [
    'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=1200&h=704&q=80',
    'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&h=704&q=80',
  ],
  food: [
    'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&h=704&q=80',
    'https://images.unsplash.com/photo-1436076863939-06870fe779c2?auto=format&fit=crop&w=1200&h=704&q=80',
  ],
  tech: [
    'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&h=704&q=80',
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1200&h=704&q=80',
  ],
  living: [
    'https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=1200&h=704&q=80',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&h=704&q=80',
  ],
  pet: [
    'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&h=704&q=80',
    'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=1200&h=704&q=80',
  ],
  fitness: [
    'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?auto=format&fit=crop&w=1200&h=704&q=80',
    'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&h=704&q=80',
  ],
  default: [
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&h=704&q=80',
    'https://images.unsplash.com/photo-1492693422561-d3260f5c2d0d?auto=format&fit=crop&w=1200&h=704&q=80',
  ],
};

export function classifyCampaignCategory(
  title?: string | null,
  description?: string | null,
): Exclude<BrowseCategoryFilter, 'all'> | null {
  const haystack = `${title ?? ''} ${description ?? ''}`.toLowerCase();
  const order: Exclude<BrowseCategoryFilter, 'all'>[] = [
    'pet',
    'beauty',
    'fitness',
    'food',
    'living',
    'tech',
  ];
  for (const id of order) {
    if (CATEGORY_KEYWORDS[id].some((keyword) => haystack.includes(keyword.toLowerCase()))) {
      return id;
    }
  }
  return null;
}

export function matchesCategoryFilter(
  auction: Pick<AuctionItem, 'title' | 'description'>,
  category: BrowseCategoryFilter,
) {
  if (category === 'all') {
    return true;
  }
  return classifyCampaignCategory(auction.title, auction.description) === category;
}

function hashKey(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function campaignCoverUrl(auction: Pick<AuctionItem, 'id' | 'title' | 'description'>) {
  const category = classifyCampaignCategory(auction.title, auction.description) ?? 'default';
  const pool = CATEGORY_COVERS[category];
  return pool[hashKey(auction.id || auction.title || '') % pool.length];
}

export function formatDeadlineBadge(deadline?: string | null) {
  const remaining = remainingDeadlineMs(deadline ?? undefined);
  if (remaining == null) {
    return 'D-?';
  }
  if (remaining <= 0) {
    return '마감';
  }
  const days = Math.max(1, Math.ceil(remaining / 86_400_000));
  return `D-${days}`;
}

export function platformBadgeLabel(platform?: PlatformType | null) {
  if (!platform) {
    return PLATFORM_LABELS.other;
  }
  return PLATFORM_LABELS[platform] ?? PLATFORM_LABELS.other;
}

export function closedCampaignBadge(status?: AuctionStatus) {
  if (status === 'cancelled') {
    return '취소';
  }
  if (status === 'completed') {
    return '결제 완료';
  }
  return '최종 매칭 완료';
}

function isGibberishField(value?: string | null) {
  const raw = value?.trim() ?? '';
  if (!raw) {
    return false;
  }
  const compact = raw.replace(/\s+/g, '');
  if (/^(dsfsdf|xcvxcv|아너아너|asdf+|qwer+|zxcv+|test+|테스트+)$/i.test(compact)) {
    return true;
  }
  if (compact.length >= 4 && compact.length <= 24 && /^([a-z가-힣0-9]{2,4})\1+$/i.test(compact)) {
    return true;
  }
  if (/^[a-z]+$/i.test(compact) && compact.length >= 4 && compact.length <= 16) {
    const vowels = (compact.match(/[aeiou]/gi) ?? []).length;
    if (vowels === 0) {
      return true;
    }
  }
  return false;
}

export function isTestCampaignCopy(
  title?: string | null,
  description?: string | null,
) {
  return isGibberishField(title) || isGibberishField(description);
}
