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
    photo:
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&h=240&q=80',
    platform: 'instagram',
  },
  {
    id: 'hayeon',
    name: '하연',
    handle: '피부일기 하연',
    amount: '30만 원',
    concept: '7일 진정 전후 클로즈업',
    photo:
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&h=240&q=80',
    platform: 'youtube',
  },
  {
    id: 'hyunwoo',
    name: '현우',
    handle: '테크리뷰 현우',
    amount: '28만 원',
    concept: '성분 라벨 15초 하이라이트',
    photo:
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=240&h=240&q=80',
    platform: 'tiktok',
  },
];

export const SHORTFORM_CARDS = [
  {
    id: 'beauty',
    title: '뷰티 릴스',
    cover:
      'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=720&h=1280&q=80',
    format: '뷰티 · 15초 릴스',
    creatorId: 'minji' as const,
    chip: 'AI 기획안 · 텍스처 매크로',
  },
  {
    id: 'tech',
    title: '테크 언박싱',
    cover:
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=720&h=1280&q=80',
    format: '테크 · 20초 쇼츠',
    creatorId: 'hyunwoo' as const,
    chip: 'AI 기획안 · 언박싱 3컷',
  },
  {
    id: 'cafe',
    title: '홈카페 브이로그',
    cover:
      'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=720&h=1280&q=80',
    format: '홈카페 · 감성 릴스',
    creatorId: 'hayeon' as const,
    chip: 'AI 기획안 · 홈카페 루틴',
  },
] as const;

export function getShowcaseCreator(id: ShowcaseCreator['id']) {
  return SHOWCASE_CREATORS.find((item) => item.id === id) ?? SHOWCASE_CREATORS[0];
}
