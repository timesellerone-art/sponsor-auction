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
  tech: ['가계부', '스마트폰', 'saas', '노트북', '핀테크', '테크', '앱', '기기', '송금'],
  pet: ['반려동물', '강아지', '고양이', '반려', '사료', '배변매트', '펫매트'],
  beauty: ['앰플', '시카', '스킨', '화장품', '코디', '룩북', '뷰티', '패션', '세럼', '립밤', '립스틱'],
  food: ['그래놀라', '맥주', '커피', '카페', '맛집', '식단', '간식', '푸드', '브런치', '음료'],
  living: ['리빙', '인테리어', '홈스타일', '공간'],
  fitness: ['헬스', '운동', '러닝화', '피트니스', '요가', '러닝'],
};

const CATEGORY_COVERS: Record<Exclude<BrowseCategoryFilter, 'all'> | 'default', string> = {
  tech: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?auto=format&fit=crop&w=1200&h=704&q=80',
  pet: 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=1200&h=704&q=80',
  beauty: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=1200&h=704&q=80',
  food: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&h=704&q=80',
  living: 'https://images.unsplash.com/photo-1616046229478-9901c5536a45?auto=format&fit=crop&w=1200&h=704&q=80',
  fitness: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1200&h=704&q=80',
  default:
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=1200&h=704&q=80',
};

const CATEGORY_ORDER: Exclude<BrowseCategoryFilter, 'all'>[] = [
  'tech',
  'pet',
  'beauty',
  'food',
  'living',
  'fitness',
];

function haystackOf(title?: string | null, description?: string | null) {
  return `${title ?? ''} ${description ?? ''}`.toLowerCase();
}

function hasKeyword(haystack: string, keyword: string) {
  return haystack.includes(keyword.toLowerCase());
}

export function classifyCampaignCategory(
  title?: string | null,
  description?: string | null,
): Exclude<BrowseCategoryFilter, 'all'> | null {
  const haystack = haystackOf(title, description);
  for (const id of CATEGORY_ORDER) {
    if (CATEGORY_KEYWORDS[id].some((keyword) => hasKeyword(haystack, keyword))) {
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

function publicImageUrl(value?: string | null) {
  const url = value?.trim() ?? '';
  if (!url) {
    return null;
  }
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:') || url.startsWith('data:image/')) {
    return url;
  }
  return null;
}

export function campaignCoverUrl(
  auction: Pick<AuctionItem, 'id' | 'title' | 'description'> & {
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
  },
) {
  const uploaded =
    publicImageUrl(auction.imageUrl) ||
    publicImageUrl(auction.thumbnailUrl) ||
    publicImageUrl((auction as { image_url?: string | null }).image_url) ||
    publicImageUrl((auction as { thumbnail_url?: string | null }).thumbnail_url);
  if (uploaded) {
    return uploaded;
  }
  const category = classifyCampaignCategory(auction.title, auction.description) ?? 'default';
  return CATEGORY_COVERS[category];
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
