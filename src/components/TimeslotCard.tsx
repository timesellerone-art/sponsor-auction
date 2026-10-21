'use client';

import Link from 'next/link';
import { AuctionCountdown } from '@/components/AuctionCountdown';
import { CreatorRatingBadge } from '@/components/CreatorRatingBadge';
import { PLATFORM_LABELS } from '@/lib/platforms';
import { useEffect, useState } from 'react';
import { isDeadlinePassed } from '@/lib/auction-engine';
import type { TimeSlotItem } from '@/types/timeslot';
import { cn, formatViews, formatWon } from '@/lib/utils';

export function TimeslotCard({ slot }: { slot: TimeSlotItem }) {
  const [open, setOpen] = useState(slot.status === 'open' && !slot.winnerBidId);

  useEffect(() => {
    const tick = () => {
      setOpen(
        slot.status === 'open' &&
          !slot.winnerBidId &&
          !isDeadlinePassed(slot.deadline),
      );
    };
    const timer = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [slot.status, slot.winnerBidId, slot.deadline]);
  const href = `/inventory/${slot.id}`;
  const price = slot.currentHighestBid > 0 ? slot.currentHighestBid : slot.startingPrice;

  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800">
          {PLATFORM_LABELS[slot.platform] ?? slot.platform}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-1 text-[11px] font-medium ring-1 ring-inset',
            slot.status === 'awarded'
              ? 'bg-teal-50 text-teal-900 ring-teal-200'
              : open
                ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                : 'bg-zinc-100 text-zinc-700 ring-zinc-200',
          )}
        >
          {slot.status === 'awarded' ? '낙찰' : open ? '입찰 가능' : '마감'}
        </span>
      </div>
      <h3 className="mt-3 line-clamp-2 text-base font-semibold text-zinc-950">
        <Link href={href} className="hover:underline">
          {slot.title}
        </Link>
      </h3>
      <p className="mt-1 text-sm text-zinc-600">{slot.creatorName}</p>
      <CreatorRatingBadge
        className="mt-1"
        rating={slot.creatorRating}
        completionRate={slot.creatorCompletionRate}
      />
      <p className="mt-2 line-clamp-2 text-sm text-zinc-500">{slot.description}</p>
      <p className="mt-4 text-lg font-bold text-zinc-950">
        {slot.currentHighestBid > 0 ? '현재 최고가 ' : '시작가 '}
        {formatWon(price)}
      </p>
      <p className="mt-1 text-xs text-zinc-500">예상 조회수 {formatViews(slot.expectedViews)}</p>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs">
        <AuctionCountdown deadline={slot.deadline} />
        <span className="text-zinc-500">입찰 {slot.bidsCount}</span>
      </div>
      <Link
        href={href}
        className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-3 text-sm font-semibold text-white hover:bg-teal-800"
      >
        {open ? '입찰하기' : '상세 보기'}
      </Link>
    </article>
  );
}

export function TimeslotCardSkeleton() {
  return (
    <div className="h-64 animate-pulse rounded-2xl border border-zinc-200 bg-white" aria-hidden />
  );
}
