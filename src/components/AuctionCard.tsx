'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AtSign,
  BookOpen,
  Camera,
  Globe,
  Hash,
  MonitorPlay,
  Music2,
  Play,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { AuctionCountdown } from '@/components/AuctionCountdown';
import { useAuth } from '@/components/AuthProvider';
import { BidModal } from '@/components/BidModal';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON } from '@/lib/access';
import { isOpenForBid } from '@/lib/auction-browse';
import { loginPath } from '@/lib/auth-guard';
import { isCampaignAuthor } from '@/lib/my-campaigns';
import { VALIDATION } from '@/lib/validation';
import { AUCTION_STATUS_LABEL } from '@/lib/status-labels';
import { PLATFORM_LABELS } from '@/lib/platforms';
import { cn, formatWon } from '@/lib/utils';
import type { AuctionItem, AuctionStatus, PlatformType } from '@/types/auction';

type AuctionCardData = Partial<AuctionItem> & {
  title?: string | null;
  budget?: number | null;
};

const PLATFORM_CHIP =
  'border-clink-border bg-clink-peach text-clink';

const platformMeta: Record<
  PlatformType,
  { label: string; icon: LucideIcon; className: string }
> = {
  youtube_shorts: {
    label: PLATFORM_LABELS.youtube_shorts,
    icon: Play,
    className: PLATFORM_CHIP,
  },
  instagram_reels: {
    label: PLATFORM_LABELS.instagram_reels,
    icon: Camera,
    className: PLATFORM_CHIP,
  },
  tiktok: {
    label: PLATFORM_LABELS.tiktok,
    icon: Music2,
    className: PLATFORM_CHIP,
  },
  youtube: {
    label: PLATFORM_LABELS.youtube,
    icon: MonitorPlay,
    className: PLATFORM_CHIP,
  },
  threads: {
    label: PLATFORM_LABELS.threads,
    icon: Hash,
    className: PLATFORM_CHIP,
  },
  naver_blog: {
    label: PLATFORM_LABELS.naver_blog,
    icon: BookOpen,
    className: PLATFORM_CHIP,
  },
  x_twitter: {
    label: PLATFORM_LABELS.x_twitter,
    icon: AtSign,
    className: PLATFORM_CHIP,
  },
  other: {
    label: PLATFORM_LABELS.other,
    icon: Globe,
    className: PLATFORM_CHIP,
  },
};

const statusMeta: Record<AuctionStatus, { label: string; className: string }> = {
  active: {
    label: AUCTION_STATUS_LABEL.active,
    className: 'bg-clink-peach text-clink-accent ring-clink-peach-strong',
  },
  matched: {
    label: AUCTION_STATUS_LABEL.matched,
    className: 'bg-clink-peach text-clink ring-clink-border',
  },
  completed: {
    label: AUCTION_STATUS_LABEL.completed,
    className: 'bg-clink-peach text-clink ring-clink-peach-strong',
  },
  cancelled: {
    label: AUCTION_STATUS_LABEL.cancelled,
    className: 'bg-stone-100 text-stone-600 ring-stone-200',
  },
  closed: {
    label: AUCTION_STATUS_LABEL.closed,
    className: 'bg-stone-100 text-stone-600 ring-stone-200',
  },
};

const budgetFormatter = new Intl.NumberFormat('ko-KR');

function formatBudget(budget: number | null | undefined) {
  const value =
    typeof budget === 'number' && Number.isFinite(budget) ? budget : 0;
  return `${budgetFormatter.format(value)}원`;
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
  const owned = Boolean(
    user &&
      auction.id &&
      isCampaignAuthor(
        {
          id: auction.id,
          authorId: auction.authorId ?? null,
        },
        user.id,
      ),
  );
  const canBid = auctionOpen && canPlaceBid && !owned;
  const isAdvertiser = Boolean(ready && user && canCreateAuction);

  return (
    <article className="flex h-full min-w-0 flex-col rounded-2xl border border-clink-border bg-white p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className="flex min-w-0 items-start gap-2">
        <span
          className={cn(
            'inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs',
            platformInfo.className,
          )}
        >
          <PlatformIcon className="size-3.5 shrink-0 text-clink-accent" aria-hidden />
          <span className="min-w-0 truncate">{platformInfo.label}</span>
        </span>
        <div className="flex max-w-[48%] shrink-0 flex-col items-end gap-1">
          {owned ? (
            <span className="rounded-full bg-clink px-2 py-1 text-[11px] font-semibold text-white">
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

      <h3 className="mt-3 line-clamp-2 min-w-0 break-words text-base font-semibold text-clink">
        <Link href={href} className="hover:underline">
          {title}
        </Link>
      </h3>

      <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-clink-muted">
        {auction.description || '설명이 없습니다.'}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-clink-border bg-[#FAF8F5] p-3 text-xs">
        <div>
          <dt className="text-clink-muted">예산</dt>
          <dd className="mt-0.5 text-sm font-semibold text-clink">{formatBudget(auction.budget)}</dd>
        </div>
        <div>
          <dt className="text-clink-muted">현재 제안 수</dt>
          <dd className="mt-0.5 inline-flex items-center gap-1 text-sm font-semibold text-clink">
            <Users className="size-3.5 text-clink-accent" aria-hidden />
            {auction.bidsCount ?? 0}건
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-clink-muted">남은 모집 기간</dt>
          <dd className="mt-0.5">
            <AuctionCountdown className="min-w-0 text-sm font-semibold text-clink" deadline={auction.deadline} />
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-clink-muted">AI 가이드</dt>
          <dd className="mt-1">
            <span className="inline-flex rounded-full bg-clink-peach px-2 py-0.5 text-[11px] font-semibold text-clink-accent">
              AI 가이드 포함
            </span>
          </dd>
        </div>
      </dl>
      {auction.highestBidAmount && auction.highestBidAmount > 0 ? (
        <p className="mt-2 text-xs text-clink-muted">
          최저 {formatWon(auction.leadingBidAmount ?? auction.highestBidAmount)}
          {' · '}
          최고 {formatWon(auction.highestBidAmount)}
        </p>
      ) : null}

      {hideBidAction ? null : owned && auctionOpen && canPlaceBid ? (
        <div className="mt-auto pt-4">
          <button
            type="button"
            disabled
            title={VALIDATION.selfCampaignHint}
            aria-label={VALIDATION.selfCampaignHint}
            className="inline-flex h-10 min-h-10 w-full min-w-0 cursor-not-allowed items-center justify-center rounded-full border border-zinc-200 bg-zinc-100 px-3 text-sm font-semibold text-zinc-400"
          >
            콘텐츠 제안하기
          </button>
          <p className="mt-1.5 text-center text-xs text-zinc-500">{VALIDATION.selfCampaignHint}</p>
        </div>
      ) : canBid ? (
        <button
          type="button"
          onClick={() => setBidOpen(true)}
          className="mt-auto inline-flex h-10 min-h-10 w-full min-w-0 items-center justify-center rounded-full bg-clink px-3 text-sm font-semibold text-white hover:bg-stone-800"
        >
          콘텐츠 제안하기
        </button>
      ) : auctionOpen && ready && !user ? (
        <button
          type="button"
          onClick={() => {
            showToast(ACCESS_REASON['creator-auth']);
            router.push(loginPath('creator-auth', href));
          }}
          className="mt-auto inline-flex min-h-10 w-full min-w-0 items-center justify-center rounded-full bg-clink px-3 py-2 text-center text-sm font-semibold break-keep text-white hover:bg-stone-800"
        >
          로그인하고 콘텐츠 제안하기
        </button>
      ) : isAdvertiser && auction.id ? (
        <Link
          href={owned ? `${href}#proposals` : href}
          className="mt-auto inline-flex h-10 min-h-10 w-full min-w-0 items-center justify-center rounded-full bg-clink-peach px-3 text-sm font-semibold text-clink hover:bg-clink-peach-strong"
        >
          {owned
            ? auctionOpen
              ? '내 캠페인 제안 현황'
              : '내 캠페인 보기'
            : auctionOpen
              ? '진행 중 · 상세 보기'
              : '상세 보기'}
        </Link>
      ) : (
        <p className="mt-auto rounded-xl bg-zinc-50 px-3 py-2 text-center text-xs text-zinc-500">
          {!auctionOpen
            ? '모집 마감'
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
            authorId: auction.authorId ?? null,
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
      className="animate-pulse rounded-2xl border border-clink-border bg-white p-4 sm:p-5"
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
