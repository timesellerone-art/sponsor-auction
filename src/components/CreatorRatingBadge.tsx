import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export function CreatorRatingBadge({
  rating,
  completionRate,
  className,
}: {
  rating?: number;
  completionRate?: number;
  className?: string;
}) {
  const hasRating = typeof rating === 'number' && Number.isFinite(rating) && rating > 0;
  const hasCompletion =
    typeof completionRate === 'number' && Number.isFinite(completionRate) && completionRate > 0;

  if (!hasRating && !hasCompletion) {
    return (
      <span className={cn('text-xs text-zinc-400', className)}>평점 없음</span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs font-medium text-zinc-700',
        className,
      )}
    >
      {hasRating ? (
        <span className="inline-flex items-center gap-0.5 text-amber-700">
          <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
          {rating.toFixed(1)}
        </span>
      ) : null}
      {hasCompletion ? (
        <span className="text-zinc-500">완수 {Math.round(completionRate)}%</span>
      ) : null}
    </span>
  );
}
