import { getDataClient } from '@/lib/supabase/data-client';
import { isUuid, uuidIds } from '@/lib/uuid';

export type PublicCreatorScore = {
  rating: number;
  completionRate: number;
};

export const MOCK_CREATOR_SCORES: Record<string, PublicCreatorScore> = {
  'usr-demo-creator': { rating: 4.8, completionRate: 97 },
  'usr-006': { rating: 4.6, completionRate: 94 },
  'usr-007': { rating: 4.9, completionRate: 99 },
  'usr-008': { rating: 4.4, completionRate: 91 },
  'usr-009': { rating: 3.8, completionRate: 72 },
};

export function scoreFromUnknown(value: unknown): PublicCreatorScore | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as { rating?: unknown; completion_rate?: unknown; completionRate?: unknown };
  const rating = Number(row.rating);
  const completionRate = Number(row.completion_rate ?? row.completionRate);
  if (!Number.isFinite(rating) && !Number.isFinite(completionRate)) {
    return null;
  }
  return {
    rating: Number.isFinite(rating) ? Math.min(5, Math.max(0, rating)) : 0,
    completionRate: Number.isFinite(completionRate)
      ? Math.min(100, Math.max(0, completionRate))
      : 0,
  };
}

export function mockScoreFor(id: string | null | undefined): PublicCreatorScore | null {
  if (!id) {
    return null;
  }
  return MOCK_CREATOR_SCORES[id] ?? null;
}

export async function getCreatorScoresByIds(
  ids: Array<string | null | undefined>,
): Promise<Map<string, PublicCreatorScore>> {
  const scores = new Map<string, PublicCreatorScore>();
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id && id.trim())))];
  for (const id of unique) {
    const mock = mockScoreFor(id);
    if (mock) {
      scores.set(id, mock);
    }
  }

  const supabase = await getDataClient();
  const uuidList = uuidIds(unique);
  if (!supabase || uuidList.length === 0) {
    return scores;
  }

  try {
    const { data, error } = await supabase
      .from('creator_metrics')
      .select('profile_id, rating, completion_rate')
      .in('profile_id', uuidList);
    if (error || !data) {
      return scores;
    }
    for (const row of data) {
      const mapped = scoreFromUnknown(row);
      if (mapped && typeof row.profile_id === 'string') {
        scores.set(row.profile_id, mapped);
      }
    }
  } catch {
    return scores;
  }

  return scores;
}

export function attachScore<T extends { creatorId?: string | null }>(
  item: T,
  scores: Map<string, PublicCreatorScore>,
): T & { creatorRating?: number; creatorCompletionRate?: number } {
  const id = item.creatorId ?? '';
  const score = (id && scores.get(id)) || mockScoreFor(id);
  if (!score) {
    return item;
  }
  return {
    ...item,
    creatorRating: score.rating,
    creatorCompletionRate: score.completionRate,
  };
}

export function isUuidProfile(id: string | null | undefined) {
  return isUuid(id);
}
