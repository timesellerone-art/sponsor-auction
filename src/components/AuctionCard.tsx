'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AtSign,
  BookOpen,
  Camera,
  Clock,
  Globe,
  Hash,
  MonitorPlay,
  Music2,
  Play,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { BidModal } from '@/components/BidModal';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON } from '@/lib/access';
import { isOpenForBid } from '@/lib/auction-browse';
import { loginPath } from '@/lib/auth-guard';
import { isOwnedAuction } from '@/lib/my-campaigns';
import { AUCTION_STATUS_LABEL } from '@/lib/status-labels';
import { PLATFORM_LABELS } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import type { AuctionItem, AuctionStatus, PlatformType } from '@/types/auction';

type AuctionCardData = Partial<AuctionItem> & {
  title?: string | null;
  budget?: number | null;
};

const platformMeta: Record<
  PlatformType,
  { label: string; icon: LucideIcon; className: string }
> = {
  youtube_shorts: {
    label: PLATFORM_LABELS.youtube_shorts,
    icon: Play,
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  instagram_reels: {
    label: PLATFORM_LABELS.instagram_reels,
    icon: Camera,
    className: 'border-pink-200 bg-pink-50 text-pink-700',
  },
  tiktok: {
    label: PLATFORM_LABELS.tiktok,
    icon: Music2,
    className: 'border-zinc-300 bg-zinc-900 text-cyan-300',
  },
  youtube: {
    label: PLATFORM_LABELS.youtube,
    icon: MonitorPlay,
    className: 'border-red-200 bg-red-50 text-red-800',
  },
  threads: {
    label: PLATFORM_LABELS.threads,
    icon: Hash,
    className: 'border-zinc-200 bg-zinc-100 text-zinc-800',
  },
  naver_blog: {
    label: PLATFORM_LABELS.naver_blog,
    icon: BookOpen,
    className: 'border-green-200 bg-green-50 text-green-800',
  },
  x_twitter: {
    label: PLATFORM_LABELS.x_twitter,
    icon: AtSign,
    className: 'border-slate-200 bg-slate-100 text-slate-800',
  },
  other: {
    label: PLATFORM_LABELS.other,
    icon: Globe,
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
};

const statusMeta: Record<AuctionStatus, { label: string; className: string }> = {
  active: {
    label: AUCTION_STATUS_LABEL.active,
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  matched: {
    label: AUCTION_STATUS_LABEL.matched,
    className: 'bg-sky-50 text-sky-800 ring-sky-200',
  },
  completed: {
    label: AUCTION_STATUS_LABEL.completed,
    className: 'bg-teal-50 text-teal-900 ring-teal-200',
  },
  cancelled: {
    label: AUCTION_STATUS_LABEL.cancelled,
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  closed: {
    label: AUCTION_STATUS_LABEL.closed,
    className: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  },
};

const budgetFormatter = new Intl.NumberFormat('ko-KR');
const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  month: 'short',
  day: 'numeric',
});

function formatBudget(budget: number | null | undefined) {
  const value =
    typeof budget === 'number' && Number.isFinite(budget) ? budget : 0;
  return `${budgetFormatter.format(value)}원`;
}

function formatDeadline(deadline: string | undefined) {
  if (!deadline) {
    return '마감일 미정';
  }

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return '마감일 미정';
  }

  return `${dateFormatter.format(date)} 마감`;
}

export function AuctionCard({
  auction,
  hideBidAction = false,
}: {
  auction: AuctionCardData;
  hideBidAction?: boolean;
}) {
  const router = useRouter();
  const { user, ready, canPlaceBid, canCreateAuction } = useAuth();
  const [bidOpen, setBidOpen] = useState(false);
  const title = auction.title || '제목 없음';
  const platform = auction.platform ?? 'other';
  const platformInfo = platformMeta[platform] ?? platformMeta.other;
  const status = auction.status ?? 'active';
  const statusInfo = statusMeta[status] ?? statusMeta.active;
  const PlatformIcon = platformInfo.icon;
  const href = auction.id ? `/auctions/${auction.id}` : '/#auctions';
  const auctionOpen = Boolean(auction.id) && isOpenForBid({
    status,
    isBlind: Boolean(auction.isBlind),
  });
  const canBid = auctionOpen && canPlaceBid;
  const owned = Boolean(
    user &&
      auction.id &&
      isOwnedAuction(
        {
          id: auction.id,
          authorId: auction.authorId ?? null,
          authorName: auction.authorName ?? '',
        },
        user,
      ),
  );
  const isAdvertiser = Boolean(ready && user && canCreateAuction);

  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex min-w-0 items-start gap-2">
        <span
          className={cn(
            'inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs',
            platformInfo.className,
          )}
        >
          <PlatformIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="min-w-0 truncate">{platformInfo.label}</span>
        </span>
        <div className="flex max-w-[48%] shrink-0 flex-col items-end gap-1">
          {owned ? (
            <span className="rounded-full bg-teal-700 px-2 py-1 text-[11px] font-semibold text-white">
              내 캠페인
            </span>
          ) : null}
          <span
            className={cn(
              'rounded-full px-2 py-1 text-[11px] font-medium ring-1 ring-inset',
              statusInfo.className,
            )}
          >
            {statusInfo.label}
          </span>
        </div>
      </div>

      <h3 className="mt-3 line-clamp-2 min-w-0 break-words text-base font-semibold text-zinc-950">
        <Link href={href} className="hover:underline">
          {title}
        </Link>
      </h3>

      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-zinc-600">
        {auction.description || '설명이 없습니다.'}
      </p>

      <p className="mt-4 text-lg font-bold tracking-tight text-zinc-950 sm:text-xl">
        {formatBudget(auction.budget)}
      </p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-zinc-500">
        <span className="inline-flex min-w-0 items-center gap-1">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{formatDeadline(auction.deadline)}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1">
          <Users className="size-3.5" aria-hidden />
          입찰 {auction.bidsCount ?? 0}
        </span>
      </div>

      {hideBidAction ? null : canBid ? (
        <button
          type="button"
          onClick={() => setBidOpen(true)}
          className="mt-4 inline-flex h-10 min-h-10 w-full min-w-0 items-center justify-center rounded-full border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
        >
          제안하기
        </button>
      ) : auctionOpen && ready && !user ? (
        <button
          type="button"
          onClick={() => {
            showToast(ACCESS_REASON['creator-auth']);
            router.push(loginPath('creator-auth', href));
          }}
          className="mt-4 inline-flex min-h-10 w-full min-w-0 items-center justify-center rounded-full border border-zinc-200 px-3 py-2 text-center text-sm font-semibold break-keep text-zinc-800 hover:bg-zinc-50"
        >
          로그인하고 제안하기
        </button>
      ) : isAdvertiser && auction.id ? (
        <Link
          href={owned ? `${href}#proposals` : href}
          className="mt-4 inline-flex h-10 min-h-10 w-full min-w-0 items-center justify-center rounded-full bg-teal-50 px-3 text-sm font-semibold text-teal-900 hover:bg-teal-100"
        >
          {owned
            ? auctionOpen
              ? '내 캠페인 입찰 현황'
              : '내 캠페인 보기'
            : auctionOpen
              ? '진행 중 · 상세 보기'
              : '상세 보기'}
        </Link>
      ) : (
        <p className="mt-4 rounded-xl bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-500">
          {!auctionOpen
            ? '입찰 불가'
            : !ready
              ? '로그인 후 크리에이터 계정으로 제안할 수 있습니다.'
              : '크리에이터 전용 기능입니다'}
        </p>
      )}

      {auction.id ? (
        <BidModal
          open={bidOpen}
          auction={{
            id: auction.id,
            title,
            budget: auction.budget ?? 0,
            status: auction.status ?? 'active',
            isBlind: Boolean(auction.isBlind),
          }}
          onClose={() => setBidOpen(false)}
          onCreated={() => {
            window.dispatchEvent(new Event('auctions:changed'));
          }}
        />
      ) : null}
    </article>
  );
}

export function AuctionCardSkeleton() {
  return (
    <div
      className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5"
      aria-hidden
    >
      <div className="flex justify-between">
        <div className="h-6 w-28 rounded-full bg-zinc-200" />
        <div className="h-6 w-12 rounded-full bg-zinc-200" />
      </div>
      <div className="mt-4 h-5 w-4/5 rounded bg-zinc-200" />
      <div className="mt-3 h-4 w-full rounded bg-zinc-100" />
      <div className="mt-2 h-4 w-2/3 rounded bg-zinc-100" />
      <div className="mt-5 h-7 w-28 rounded bg-zinc-200" />
      <div className="mt-6 flex justify-between">
        <div className="h-3 w-20 rounded bg-zinc-100" />
        <div className="h-3 w-14 rounded bg-zinc-100" />
      </div>
    </div>
  );
}
