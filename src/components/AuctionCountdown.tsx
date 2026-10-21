'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { formatCountdown, remainingDeadlineMs } from '@/lib/auction-engine';
import { cn } from '@/lib/utils';

export function AuctionCountdown({
  deadline,
  className,
}: {
  deadline?: string;
  className?: string;
}) {
  const [label, setLabel] = useState('마감 계산 중');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const remaining = remainingDeadlineMs(deadline);
      setExpired(remaining != null && remaining <= 0);
      setLabel(formatCountdown(remaining));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 tabular-nums',
        expired ? 'text-rose-600' : 'text-zinc-600',
        className,
      )}
    >
      <Clock className="size-3.5 shrink-0" aria-hidden />
      {expired ? '마감됨' : `남은 시간 ${label}`}
    </span>
  );
}
