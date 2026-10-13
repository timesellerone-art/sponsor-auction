'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Users } from 'lucide-react';
import { AiAgentGuide } from '@/components/AiAgentGuide';
import { useAuth } from '@/components/AuthProvider';
import { BidModal } from '@/components/BidModal';
import { BidProposalList } from '@/components/BidProposalList';
import { PaymentCheckoutModal } from '@/components/PaymentCheckoutModal';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { useAwardCheckout } from '@/hooks/useAwardCheckout';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { ACCESS_REASON } from '@/lib/access';
import { loginPath } from '@/lib/auth-guard';
import { buildFallbackReport } from '@/lib/ai-report';
import { getAuctionById, getBidsByAuctionId } from '@/lib/auctions';
import { isMyAuction } from '@/lib/my-campaigns';
import { formatWon } from '@/lib/utils';
import type { AiAnalyzeResponse, AiReport } from '@/types/ai';
import { isAuctionClosed, type AuctionItem, type BidItem } from '@/types/auction';

function formatDeadline(deadline: string | undefined) {
  if (!deadline) {
    return '마감일 미정';
  }

  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) {
    return '마감일 미정';
  }

  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function AuctionDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user, ready, canPlaceBid, canCreateAuction } = useAuth();
  const { requireAdvertiser } = useRequireAuth();
  const [auction, setAuction] = useState<AuctionItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bids, setBids] = useState<BidItem[]>([]);
  const [bidsLoading, setBidsLoading] = useState(true);
  const [bidsError, setBidsError] = useState<string | null>(null);
  const [awardBusyId, setAwardBusyId] = useState<string | null>(null);
  const { run: runAward } = useActionLock();
  const { checkout, startCheckout, closeCheckout } = useAwardCheckout();
  const [bidOpen, setBidOpen] = useState(false);
  const [report, setReport] = useState<AiReport | null>(null);
  const [reportSource, setReportSource] = useState<AiAnalyzeResponse['source'] | null>(
    null,
  );
  const [reportLoading, setReportLoading] = useState(true);

  const loadAuction = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAuctionById(id);
      setAuction(result.data);
      setLoadError(result.error);
    } catch {
      setAuction(null);
      setLoadError('경매 정보를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadBids = useCallback(async () => {
    setBidsLoading(true);
    try {
      const result = await getBidsByAuctionId(id);
      setBids(Array.isArray(result.data) ? result.data : []);
      setBidsError(result.error);
    } catch {
      setBids([]);
      setBidsError('제안 목록을 불러오지 못했습니다.');
    } finally {
      setBidsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void loadAuction();
    void loadBids();

    const onChanged = () => {
      void loadAuction();
      void loadBids();
    };
    window.addEventListener('auctions:changed', onChanged);

    return () => {
      window.removeEventListener('auctions:changed', onChanged);
    };
  }, [loadAuction, loadBids]);

  useEffect(() => {
    if (!auction) {
      return;
    }

    let cancelled = false;

    const loadReport = async () => {
      setReportLoading(true);

      try {
        const response = await fetch('/api/ai-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: auction.title,
            platform: auction.platform,
            budget: auction.budget,
            description: auction.description,
          }),
        });

        if (!response.ok) {
          throw new Error('AI analyze failed');
        }

        const payload = (await response.json()) as AiAnalyzeResponse;
        if (cancelled) {
          return;
        }

        if (!payload?.report?.concepts?.length) {
          throw new Error('Invalid AI payload');
        }

        setReport(payload.report);
        setReportSource(payload.source === 'ai' ? 'ai' : 'fallback');
      } catch {
        if (cancelled) {
          return;
        }

        setReport(
          buildFallbackReport({
            title: auction.title,
            platform: auction.platform,
            budget: auction.budget,
            description: auction.description,
          }),
        );
        setReportSource('fallback');
      } finally {
        if (!cancelled) {
          setReportLoading(false);
        }
      }
    };

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [auction]);

  const title = auction?.title || '제목 없음';
  const auctionOpen = auction?.status === 'active' && !auction.isBlind;
  const canBid = Boolean(auctionOpen && canPlaceBid);

  const handleBidCreated = () => {
    setAuction((current) =>
      current
        ? { ...current, bidsCount: (current.bidsCount ?? 0) + 1 }
        : current,
    );
    void loadAuction();
    void loadBids();
  };

  const isOwner = Boolean(
    auction && canCreateAuction && isMyAuction(auction.id),
  );
  const matched = Boolean(auction && isAuctionClosed(auction.status));
  const selectedBid =
    bids.find(
      (bid) =>
        bid.status === 'selected' ||
        (auction?.winnerBidId && auction.winnerBidId === bid.id),
    ) ?? null;

  const handleAward = async (bid: BidItem) => {
    if (!auction?.id || !bid?.id) {
      return;
    }
    if (!requireAdvertiser('award-auth', `/auctions/${auction.id}`)) {
      return;
    }
    if (!isOwner) {
      showToast(ACCESS_REASON['advertiser-forbidden']);
      return;
    }

    await runAward(bid.id, async () => {
      setAwardBusyId(bid.id);
      try {
        await startCheckout(auction, bid);
      } finally {
        setAwardBusyId(null);
      }
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/#auctions"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-950"
      >
        <ArrowLeft className="size-4" aria-hidden />
        목록으로
      </Link>

      {loading ? (
        <div className="mt-6 space-y-4">
          <div className="h-40 animate-pulse rounded-2xl bg-teal-50" />
          <div className="h-48 animate-pulse rounded-2xl bg-white" />
        </div>
      ) : !auction ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-medium text-zinc-800">
            해당 역경매를 찾을 수 없습니다
          </p>
          {loadError ? (
            <p className="mt-2 text-sm text-zinc-500">{loadError}</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          <AiAgentGuide
            report={report}
            source={reportSource}
            loading={reportLoading}
          />

          <article className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-teal-800">
                역경매 상세
              </p>
              {matched ? (
                <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                  매칭 완료된 역경매입니다
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-2xl font-bold break-keep text-zinc-950">
              {title}
            </h1>
            {matched && selectedBid ? (
              <p className="mt-2 text-sm text-zinc-600">
                선택된 크리에이터{' '}
                <strong className="text-zinc-950">
                  {selectedBid.creatorName || '이름 없음'}
                </strong>
                {' · '}
                {formatWon(selectedBid.bidAmount)}
              </p>
            ) : null}
            <p className="mt-4 text-2xl font-bold tracking-tight text-zinc-950">
              {formatWon(auction.budget)}
            </p>
            <p className="mt-4 text-sm leading-6 whitespace-pre-wrap text-zinc-600">
              {auction.description || '설명이 없습니다.'}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-zinc-500">
              <span className="inline-flex items-center gap-1">
                <Clock className="size-4" aria-hidden />
                {formatDeadline(auction.deadline)}
              </span>
              <span className="inline-flex items-center gap-1">
                <Users className="size-4" aria-hidden />
                입찰 {auction.bidsCount ?? 0}
              </span>
            </div>
            {canBid ? (
              <button
                type="button"
                onClick={() => setBidOpen(true)}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
              >
                제안하기
              </button>
            ) : (
              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                {!auctionOpen
                  ? '이 역경매는 마감되었거나 제안을 받지 않습니다.'
                  : !ready || !user
                    ? '로그인 후 크리에이터 계정으로 제안할 수 있습니다. 크리에이터 전용 기능입니다.'
                    : '크리에이터 전용 기능입니다. 광고주 계정으로는 입찰할 수 없습니다.'}
                {!user && auctionOpen ? (
                  <button
                    type="button"
                    onClick={() => {
                      showToast(ACCESS_REASON['creator-auth']);
                      router.push(loginPath('creator-auth', `/auctions/${auction.id}`));
                    }}
                    className="mt-2 block text-sm font-semibold text-teal-800 hover:underline"
                  >
                    로그인하러 가기
                  </button>
                ) : null}
              </div>
            )}
          </article>

          <BidProposalList
            auction={auction}
            bids={bids}
            loading={bidsLoading}
            error={bidsError}
            busyId={awardBusyId}
            allowAward={isOwner}
            onAward={handleAward}
          />
        </div>
      )}

      <PaymentCheckoutModal
        open={Boolean(checkout)}
        checkout={checkout}
        onClose={closeCheckout}
      />

      {auction ? (
        <BidModal
          open={bidOpen}
          auction={{
            id: auction.id,
            title,
            budget: auction.budget,
            status: auction.status,
            isBlind: auction.isBlind,
          }}
          onClose={() => setBidOpen(false)}
          onCreated={handleBidCreated}
        />
      ) : null}
    </div>
  );
}
