export interface CreatorMetrics {
  profileId: string;
  rating: number;
  completionRate: number;
  penaltyCount: number;
  youtubeVerified: boolean;
  youtubeChannelId: string | null;
  youtubeChannelUrl: string | null;
  youtubeChannelTitle: string | null;
  youtubeSubscriberCount: number;
  youtubeVideoCount: number;
  youtubeViewCount: number;
  youtubeMetricsSyncedAt: string | null;
  updatedAt: string;
}

export const EMPTY_CREATOR_METRICS = {
  rating: 0,
  completionRate: 0,
  penaltyCount: 0,
  youtubeVerified: false,
  youtubeChannelId: null,
  youtubeChannelUrl: null,
  youtubeChannelTitle: null,
  youtubeSubscriberCount: 0,
  youtubeVideoCount: 0,
  youtubeViewCount: 0,
  youtubeMetricsSyncedAt: null,
} as const;

export function isCreatorMetrics(value: unknown): value is CreatorMetrics {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as Partial<CreatorMetrics>;
  return (
    typeof row.profileId === 'string' &&
    typeof row.rating === 'number' &&
    typeof row.completionRate === 'number' &&
    typeof row.penaltyCount === 'number' &&
    typeof row.youtubeVerified === 'boolean'
  );
}
