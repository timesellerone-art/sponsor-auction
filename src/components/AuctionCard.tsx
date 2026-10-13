'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AtSign,
  Camera,
  Clock,
  Globe,
  Music2,
  Play,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { BidModal } from '@/components/BidModal';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON } from '@/lib/access';
import { loginPath } from '@/lib/auth-guard';
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
    label: 'YouTube Shorts',
    icon: Play,
    className: 'border-red-200 bg-red-50 text-red-700',
  },
  instagram_reels: {
    label: 'Instagram Reels',
    icon: Camera,
    className: 'border-pink-200 bg-pink-50 text-pink-700',
  },
  tiktok: {
    label: 'TikTok',
    icon: Music2,
    className: 'border-zinc-300 bg-zinc-900 text-cyan-300',
  },
  x_twitter: {
    label: 'X (Twitter)',
    icon: AtSign,
    className: 'border-slate-200 bg-slate-100 text-slate-800',
  },
  other: {
    label: '기타',
    icon: Globe,
    className: 'border-amber-200 bg-amber-50 text-amber-800',
  },
};

const statusMeta: Record<AuctionStatus, { label: string; className: string }> = {
  active: {
    label: '진행중',
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  matched: {
    label: '매칭됨',
    className: 'bg-sky-50 text-sky-800 ring-sky-200',
  },
  completed: {
    label: '마감',
    className: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  },
  cancelled: {
    label: '취소',
    className: 'bg-rose-50 text-rose-700 ring-rose-200',
  },
  closed: {
    label: '매칭 완료',
    className: 'bg-teal-50 text-teal-800 ring-teal-200',
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

export function AuctionCard({ auction }: { auction: AuctionCardData }) {
  const router = useRouter();
  const { user, ready, canPlaceBid } = useAuth();
  const [bidOpen, setBidOpen] = useState(false);
  const title = auction.title || '제목 없음';
  const platform = auction.platform ?? 'other';
  const platformInfo = platformMeta[platform] ?? platformMeta.other;
  const status = auction.status ?? 'active';
  const statusInfo = statusMeta[status] ?? statusMeta.active;
  const PlatformIcon = platformInfo.icon;
  const href = auction.id ? `/auctions/${auction.id}` : '/#auctions';
  const auctionOpen = Boolean(auction.id) && status === 'active' && !auction.isBlind;
  const canBid = auctionOpen && canPlaceBid;

  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <span
          className={cn(
            'inline-flex max-w-[70%] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
            platformInfo.className,
          )}
        >
          <PlatformIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{platformInfo.label}</span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ring-1 ring-inset',
            statusInfo.className,
          )}
        >
          {statusInfo.label}
        </span>
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

      {canBid ? (
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
