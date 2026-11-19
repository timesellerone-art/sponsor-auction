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
  | 'fitness'
  | 'parenting';

export type CampaignCategoryId = Exclude<BrowseCategoryFilter, 'all'>;

export const CAMPAIGN_CATEGORIES: { id: BrowseCategoryFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'beauty', label: '뷰티·패션' },
  { id: 'food', label: '푸드·카페' },
  { id: 'tech', label: '테크·앱' },
  { id: 'living', label: '리빙·인테리어' },
  { id: 'pet', label: '반려동물' },
  { id: 'fitness', label: '헬스·운동' },
  { id: 'parenting', label: '육아·라이프' },
];

export const SELECTABLE_CAMPAIGN_CATEGORIES = CAMPAIGN_CATEGORIES.filter(
  (item): item is { id: CampaignCategoryId; label: string } => item.id !== 'all',
);

const CATEGORY_LABELS: Record<CampaignCategoryId, string> = {
  beauty: '뷰티·패션',
  food: '푸드·카페',
  tech: '테크·앱',
  living: '리빙·인테리어',
  pet: '반려동물',
  fitness: '헬스·운동',
  parenting: '육아·라이프',
};

const CATEGORY_MARKER = '콘텐츠 분야:';
const IMAGE_MARKER = '대표사진:';
const CAMPAIGN_META_PREFIXES = [CATEGORY_MARKER, IMAGE_MARKER] as const;

function splitCampaignMeta(description?: string | null) {
  const lines = (description ?? '').split(/\r?\n/);
  const meta: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index]?.trim() ?? '';
    if (CAMPAIGN_META_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
      meta.push(trimmed);
      index += 1;
      continue;
    }
    if (trimmed === '' && meta.length > 0) {
      index += 1;
      continue;
    }
    break;
  }
  return { meta, body: lines.slice(index).join('\n') };
}

const CATEGORY_KEYWORDS: Record<CampaignCategoryId, string[]> = {
  tech: ['가계부', '스마트폰', 'saas', '노트북', '핀테크', '테크', '앱', '기기', '송금'],
  pet: ['반려동물', '강아지', '고양이', '반려', '사료', '배변매트', '펫매트'],
  beauty: ['앰플', '시카', '스킨', '화장품', '코디', '룩북', '뷰티', '패션', '세럼', '립밤', '립스틱'],
  food: ['그래놀라', '맥주', '커피', '카페', '맛집', '식단', '간식', '푸드', '브런치', '음료'],
  living: ['리빙', '인테리어', '홈스타일', '공간'],
  fitness: ['헬스', '운동', '러닝화', '피트니스', '요가', '러닝'],
  parenting: ['육아', '아기', '유아', '신생아', '키즈', '워킹맘', '육아템', '이유식', '기저귀', '맘카페'],
};

const CATEGORY_COVERS: Record<CampaignCategoryId | 'default', string> = {
  tech: '/covers/tech.jpg',
  pet: '/covers/pet.jpg',
  beauty: '/covers/beauty.jpg',
  food: '/covers/food.jpg',
  living: '/covers/living.jpg',
  fitness: '/covers/fitness.jpg',
  parenting: '/covers/parenting.jpg',
  default: '/covers/default-cat.jpg',
};

const CATEGORY_ORDER: CampaignCategoryId[] = [
  'tech',
  'pet',
  'beauty',
  'food',
  'living',
  'fitness',
  'parenting',
];

export function isCampaignCategoryId(value: string | null | undefined): value is CampaignCategoryId {
  return Boolean(value && value in CATEGORY_LABELS);
}

export function campaignCategoryLabel(id: CampaignCategoryId) {
  return CATEGORY_LABELS[id];
}

export function campaignCategoryIdFromLabel(label: string): CampaignCategoryId | null {
  const normalized = label.trim();
  const found = SELECTABLE_CAMPAIGN_CATEGORIES.find((item) => item.label === normalized);
  return found?.id ?? null;
}

export function parseCategoryFromDescription(description?: string | null): CampaignCategoryId | null {
  const line = splitCampaignMeta(description).meta.find((item) => item.startsWith(CATEGORY_MARKER));
  if (!line) {
    return null;
  }
  return campaignCategoryIdFromLabel(line.slice(CATEGORY_MARKER.length).trim());
}

export function parseImageFromDescription(description?: string | null): string | null {
  const line = splitCampaignMeta(description).meta.find((item) => item.startsWith(IMAGE_MARKER));
  if (!line) {
    return null;
  }
  const url = line.slice(IMAGE_MARKER.length).trim();
  return /^https?:\/\//i.test(url) ? url : null;
}

export function withCategoryMarker(description: string, category: CampaignCategoryId) {
  const imageUrl = parseImageFromDescription(description);
  const body = displayCampaignDescription(description).trim();
  const lines = [`${CATEGORY_MARKER} ${campaignCategoryLabel(category)}`];
  if (imageUrl) {
    lines.push(`${IMAGE_MARKER} ${imageUrl}`);
  }
  return `${lines.join('\n')}\n\n${body}`;
}

export function withImageMarker(description: string, imageUrl: string) {
  const category = parseCategoryFromDescription(description);
  const body = displayCampaignDescription(description).trim();
  const lines: string[] = [];
  if (category) {
    lines.push(`${CATEGORY_MARKER} ${campaignCategoryLabel(category)}`);
  }
  lines.push(`${IMAGE_MARKER} ${imageUrl}`);
  return `${lines.join('\n')}\n\n${body}`;
}

export function displayCampaignDescription(description?: string | null) {
  return splitCampaignMeta(description).body;
}

function haystackOf(title?: string | null, description?: string | null) {
  return `${title ?? ''} ${description ?? ''}`.toLowerCase();
}

function hasKeyword(haystack: string, keyword: string) {
  return haystack.includes(keyword.toLowerCase());
}

export function classifyCampaignCategory(
  title?: string | null,
  description?: string | null,
): CampaignCategoryId | null {
  const marked = parseCategoryFromDescription(description);
  if (marked) {
    return marked;
  }
  const haystack = haystackOf(title, displayCampaignDescription(description));
  for (const id of CATEGORY_ORDER) {
    if (CATEGORY_KEYWORDS[id].some((keyword) => hasKeyword(haystack, keyword))) {
      return id;
    }
  }
  return null;
}

export function resolveCampaignCategory(
  auction: Pick<AuctionItem, 'title' | 'description'> & { category?: string | null },
): CampaignCategoryId | null {
  if (isCampaignCategoryId(auction.category)) {
    return auction.category;
  }
  return classifyCampaignCategory(auction.title, auction.description);
}

export function matchesCategoryFilter(
  auction: Pick<AuctionItem, 'title' | 'description'> & { category?: string | null },
  category: BrowseCategoryFilter,
) {
  if (category === 'all') {
    return true;
  }
  return resolveCampaignCategory(auction) === category;
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
    category?: string | null;
  },
) {
  const uploaded =
    publicImageUrl(auction.imageUrl) ||
    publicImageUrl(auction.thumbnailUrl) ||
    publicImageUrl((auction as { image_url?: string | null }).image_url) ||
    publicImageUrl((auction as { thumbnail_url?: string | null }).thumbnail_url) ||
    publicImageUrl(parseImageFromDescription(auction.description));
  if (uploaded) {
    return uploaded;
  }
  const category = resolveCampaignCategory(auction) ?? 'default';
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

const HANGUL_JAMO = /[\u1100-\u11FF\u3131-\u318E]/;
const KEYBOARD_SMASH = /asdf|qwer|zxcv|qweasd|asdzxc|hjkl|dfgh|cvbn/i;

function latinVowelRatio(compact: string) {
  if (!compact) {
    return 1;
  }
  return (compact.match(/[aeiou]/gi) ?? []).length / compact.length;
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
  if (HANGUL_JAMO.test(compact)) {
    return true;
  }
  if (/^[a-z]+$/i.test(compact) && compact.length >= 4 && compact.length <= 16) {
    if (latinVowelRatio(compact) === 0) {
      return true;
    }
  }
  if (/^[a-z]+$/i.test(compact) && compact.length >= 12 && latinVowelRatio(compact) <= 0.2) {
    return true;
  }
  if (KEYBOARD_SMASH.test(compact) && compact.length >= 8 && !/[가-힣]/.test(compact)) {
    return true;
  }
  return false;
}

export function isTestCampaignCopy(
  title?: string | null,
  description?: string | null,
) {
  return isGibberishField(title) || isGibberishField(description);
}
