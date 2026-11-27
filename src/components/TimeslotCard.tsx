'use client';

import Link from 'next/link';
import { AuctionCountdown } from '@/components/AuctionCountdown';
import { CreatorRatingBadge } from '@/components/CreatorRatingBadge';
import { useEffect, useState } from 'react';
import { isDeadlinePassed } from '@/lib/auction-engine';
import {
  campaignCategoryLabel,
  campaignCoverUrl,
  displayCampaignDescription,
  platformBadgeLabel,
  resolveCampaignCategory,
} from '@/lib/campaign-presentation';
import { isTimeslotAwaitingPayment, type TimeSlotItem } from '@/types/timeslot';
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
  const href = `/timeslots/${slot.id}`;
  const cover = campaignCoverUrl({
    id: slot.id,
    title: slot.title,
    description: slot.description,
    imageUrl: slot.imageUrl,
    category: slot.category,
  });
  const categoryId = resolveCampaignCategory({
    title: slot.title,
    description: slot.description,
    category: slot.category,
  });
  const platformLabel = categoryId
    ? `${campaignCategoryLabel(categoryId)} · ${platformBadgeLabel(slot.platform)}`
    : platformBadgeLabel(slot.platform);

  return (
    <article className="relative z-0 flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-stone-900/5 transition-shadow hover:shadow-md">
      <div className="relative isolate z-0 h-44 shrink-0 overflow-hidden bg-stone-200">
        <img
          src={cover}
          alt=""
          width={600}
          height={176}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
        <div className="absolute inset-x-3 top-3 z-10 flex flex-wrap content-start gap-1.5">
          <span className="max-w-full truncate rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
            {platformLabel}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md',
              isTimeslotAwaitingPayment(slot) ? 'bg-amber-700/80' : 'bg-black/60',
            )}
          >
            {isTimeslotAwaitingPayment(slot)
              ? '결제 대기'
              : slot.status === 'awarded'
                ? '진행 중'
                : open
                  ? '신청 가능'
                  : '마감'}
          </span>
        </div>
      </div>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-2 bg-white p-4 sm:p-5">
        <h3 className="line-clamp-2 text-base font-semibold text-zinc-950">
          <Link href={href} className="hover:underline">
            {slot.title}
          </Link>
        </h3>
        <p className="text-sm text-zinc-600">{slot.creatorName}</p>
        <CreatorRatingBadge
          className="mt-0"
          rating={slot.creatorRating}
          completionRate={slot.creatorCompletionRate}
        />
        <p className="line-clamp-2 text-sm text-zinc-500">
          {displayCampaignDescription(slot.description) || '설명이 없습니다.'}
        </p>
        <p className="mt-2 text-lg font-bold text-zinc-950">단가 {formatWon(slot.startingPrice)}</p>
        <p className="text-xs text-zinc-500">예상 조회수 {formatViews(slot.expectedViews)}</p>
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs">
          <AuctionCountdown deadline={slot.deadline} />
          <span className="text-zinc-500">지원 {slot.bidsCount}</span>
        </div>
        <Link
          href={href}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-clink px-3 text-sm font-semibold text-white hover:bg-stone-800"
        >
          {open ? '제안하기' : '상세 보기'}
        </Link>
      </div>
    </article>
  );
}

export function TimeslotCardSkeleton() {
  return (
    <div className="h-80 animate-pulse rounded-2xl border border-zinc-200 bg-white" aria-hidden />
  );
}
