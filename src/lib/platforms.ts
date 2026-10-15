import type { PlatformType } from '@/types/auction';

export const SELECTABLE_PLATFORMS = [
  { id: 'youtube_shorts', label: 'YouTube Shorts' },
  { id: 'instagram_reels', label: 'Instagram Reels' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'threads', label: 'Threads' },
  { id: 'naver_blog', label: 'Naver Blog' },
  { id: 'x_twitter', label: 'X (Twitter)' },
] as const;

export type SelectablePlatform = (typeof SELECTABLE_PLATFORMS)[number]['id'];

export const PLATFORM_LABELS: Record<PlatformType, string> = {
  youtube_shorts: 'YouTube Shorts',
  instagram_reels: 'Instagram Reels',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  threads: 'Threads',
  naver_blog: 'Naver Blog',
  x_twitter: 'X (Twitter)',
  other: '기타',
};

export function isPlatformType(value: string): value is PlatformType {
  return Object.prototype.hasOwnProperty.call(PLATFORM_LABELS, value);
}

export function platformLabel(value: string) {
  return isPlatformType(value) ? PLATFORM_LABELS[value] : PLATFORM_LABELS.other;
}
