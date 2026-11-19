export type ShowcasePlatform = 'youtube' | 'instagram' | 'tiktok';

export type ShowcaseCreator = {
  id: 'minji' | 'hayeon' | 'hyunwoo';
  name: string;
  handle: string;
  amount: string;
  concept: string;
  photo: string;
  platform: ShowcasePlatform;
};

export const SHOWCASE_CREATORS: ShowcaseCreator[] = [
  {
    id: 'minji',
    name: '민지',
    handle: '민지 · 뷰티 릴스',
    amount: '25만 원',
    concept: '앰플 텍스처 매크로 훅',
    photo: '/home/minji.jpg',
    platform: 'instagram',
  },
  {
    id: 'hayeon',
    name: '하연',
    handle: '피부일기 하연',
    amount: '30만 원',
    concept: '7일 진정 전후 클로즈업',
    photo: '/home/hayeon.jpg',
    platform: 'youtube',
  },
  {
    id: 'hyunwoo',
    name: '현우',
    handle: '테크리뷰 현우',
    amount: '28만 원',
    concept: '성분 라벨 15초 하이라이트',
    photo: '/home/hyunwoo.jpg',
    platform: 'tiktok',
  },
];

export const SHORTFORM_CARDS = [
  {
    id: 'beauty',
    title: '뷰티 릴스',
    cover: '/home/beauty-reel.jpg',
    format: '뷰티 · 15초 릴스',
    creatorId: 'minji' as const,
    chip: 'AI 기획안 · 텍스처 매크로',
  },
  {
    id: 'tech',
    title: '테크 언박싱',
    cover: '/home/tech-unbox.jpg',
    format: '테크 · 20초 쇼츠',
    creatorId: 'hyunwoo' as const,
    chip: 'AI 기획안 · 언박싱 3컷',
  },
  {
    id: 'cafe',
    title: '홈카페 브이로그',
    cover: '/home/cafe.jpg',
    format: '홈카페 · 감성 릴스',
    creatorId: 'hayeon' as const,
    chip: 'AI 기획안 · 홈카페 루틴',
  },
] as const;

export function getShowcaseCreator(id: ShowcaseCreator['id']) {
  return SHOWCASE_CREATORS.find((item) => item.id === id) ?? SHOWCASE_CREATORS[0];
}
