'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { BidModal } from '@/components/BidModal';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON } from '@/lib/access';
import { isOpenForBid } from '@/lib/auction-browse';
import { loginPath } from '@/lib/auth-guard';
import {
  campaignCoverUrl,
  formatDeadlineBadge,
  platformBadgeLabel,
} from '@/lib/campaign-presentation';
import { isCampaignAuthor } from '@/lib/my-campaigns';
import { VALIDATION } from '@/lib/validation';
import { AUCTION_STATUS_LABEL } from '@/lib/status-labels';
import { formatWon } from '@/lib/utils';
import type { AuctionItem, AuctionStatus } from '@/types/auction';

type AuctionCardData = Partial<AuctionItem> & {
  title?: string | null;
  budget?: number | null;
};

const CARD_CTA =
  'mt-auto inline-flex h-10 min-h-10 w-full min-w-0 items-center justify-center rounded-full bg-[#FFF7ED] px-3 text-sm font-semibold text-[#1C1917] ring-1 ring-stone-900/5 transition-colors hover:bg-[#1C1917] hover:text-white';

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
  const status = auction.status ?? 'active';
  const statusInfo = statusMeta[status] ?? statusMeta.active;
  const href = auction.id ? `/auctions/${auction.id}` : '/#auctions';
  const cover = campaignCoverUrl({
    id: auction.id ?? title,
    title,
    description: auction.description ?? '',
  });
  const deadlineBadge = formatDeadlineBadge(auction.deadline);
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
    <article className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl bg-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-stone-900/5 transition-shadow hover:shadow-md">
      <div className="relative h-44 overflow-hidden bg-stone-200">
        <img
          src={cover}
          alt=""
          width={600}
          height={176}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
        <span className="absolute top-3 left-3 max-w-[70%] truncate rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          {platformBadgeLabel(platform)}
        </span>
        <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
          {auctionOpen ? deadlineBadge : statusInfo.label}
        </span>
        {owned ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-[#1C1917] px-2 py-0.5 text-[10px] font-semibold text-white">
            내 캠페인
          </span>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 p-4 sm:p-5">
      <h3 className="line-clamp-2 min-w-0 break-words text-base font-bold tracking-[-0.03em] leading-[1.15] text-clink">
        <Link href={href} className="hover:underline">
          {title}
        </Link>
      </h3>

      <p className="line-clamp-2 text-sm leading-5 text-clink-muted">
        {auction.description || '설명이 없습니다.'}
      </p>

      <div className="mt-1 flex items-end justify-between gap-3 border-t border-stone-200/80 pt-4">
        <div className="min-w-0">
          <p className="text-[11px] text-clink-muted">예산</p>
          <p className="mt-0.5 truncate text-xl font-bold tracking-tight text-[#1C1917]">
            {formatBudget(auction.budget)}
          </p>
        </div>
        <p className="shrink-0 text-xs text-clink-muted">제안 {auction.bidsCount ?? 0}건</p>
      </div>
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
            className="inline-flex h-10 min-h-10 w-full min-w-0 cursor-not-allowed items-center justify-center rounded-full bg-stone-100 px-3 text-sm font-semibold text-stone-400"
          >
            콘텐츠 제안하기
          </button>
          <p className="mt-1.5 text-center text-xs text-zinc-500">{VALIDATION.selfCampaignHint}</p>
        </div>
      ) : canBid ? (
        <button
          type="button"
          onClick={() => setBidOpen(true)}
          className={CARD_CTA}
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
          className={`${CARD_CTA} py-2 text-center break-keep`}
        >
          로그인하고 콘텐츠 제안하기
        </button>
      ) : isAdvertiser && auction.id ? (
        <Link
          href={owned ? `${href}#proposals` : href}
          className={CARD_CTA}
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
      </div>

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
      className="animate-pulse overflow-hidden rounded-2xl bg-white ring-1 ring-stone-900/5"
      aria-hidden
    >
      <div className="h-44 bg-zinc-200" />
      <div className="p-4 sm:p-5">
        <div className="h-5 w-4/5 rounded bg-zinc-200" />
        <div className="mt-3 h-4 w-full rounded bg-zinc-100" />
        <div className="mt-2 h-4 w-2/3 rounded bg-zinc-100" />
        <div className="mt-5 h-8 w-28 rounded bg-zinc-200" />
        <div className="mt-6 h-10 w-full rounded-full bg-zinc-200" />
      </div>
    </div>
  );
}
