'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AuctionCard, AuctionCardSkeleton } from '@/components/AuctionCard';
import { PageContainer } from '@/components/PageContainer';
import { BidProposalList } from '@/components/BidProposalList';
import { FeeBreakdownCard } from '@/components/fee/FeeBreakdownCard';
import { CreditChargeModal } from '@/components/CreditChargeModal';
import { useActionLock } from '@/hooks/useActionLock';
import { useAwardCheckout } from '@/hooks/useAwardCheckout';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { isOpenForBid } from '@/lib/auction-browse';
import { getAdvertiserDashboard } from '@/lib/dashboard';
import { auctionStatusLabel } from '@/lib/status-labels';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import { cn, formatDateTime, formatWon } from '@/lib/utils';
import type { AdvertiserDeal } from '@/types/dashboard';
import { isAwardedAuction, isBidSelected, type AuctionItem, type BidItem } from '@/types/auction';

type AdvertiserView = 'open' | 'paid' | 'proposals' | 'ended';

const VIEWS: { id: AdvertiserView; label: string }[] = [
  { id: 'open', label: '진행 중 캠페인' },
  { id: 'paid', label: '결제 완료 목록' },
  { id: 'proposals', label: '캠페인별 제안 현황' },
  { id: 'ended', label: '종료된 캠페인' },
];

export function AdvertiserDashboard() {
  const { user, requireAdvertiser } = useRequireAuth();
  const userId = user?.id ?? '';
  const userRef = useRef(user);
  const [deals, setDeals] = useState<AdvertiserDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awardBusyId, setAwardBusyId] = useState<string | null>(null);
  const [view, setView] = useState<AdvertiserView>('open');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const { run: runAward } = useActionLock();
  const { awardWithCredit, chargeNeeded, closeCharge } = useAwardCheckout();

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    let cancelled = false;

    const load = async (silent: boolean) => {
      const actor = userRef.current;
      if (!actor) {
        return;
      }
      if (!silent) {
        setLoading(true);
      }
      try {
        const result = await getAdvertiserDashboard(actor);
        if (cancelled) {
          return;
        }
        const list = Array.isArray(result.data) ? result.data : [];
        setDeals(list);
        setError(list.length === 0 ? '등록한 캠페인이 없습니다.' : result.error);
      } catch {
        if (!cancelled) {
          setDeals([]);
          setError('캠페인을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load(false);
    const onChanged = () => {
      void load(true);
    };
    window.addEventListener('auctions:changed', onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('auctions:changed', onChanged);
    };
  }, [userId]);

  const handleAward = async (auction: AuctionItem, bid: BidItem) => {
    if (!auction?.id || !bid?.id) {
      return;
    }
    if (!requireAdvertiser('award-auth', '/my')) {
      return;
    }

    if (awardBusyId) {
      return;
    }
    setAwardBusyId(bid.id);
    await runAward(bid.id, async () => {
      const awarded = await awardWithCredit(auction, bid);
      if (!awarded) {
        return;
      }
      setDeals((current) =>
        current.map((deal) =>
          deal.auction.id === awarded.id
            ? {
                ...deal,
                auction: awarded,
                bid:
                  deal.bid?.id === awarded.winnerBidId || deal.bid?.id === bid.id
                    ? { ...deal.bid, status: 'selected' as const }
                    : deal.bid,
                bids: deal.bids.map((item) =>
                  item.id === awarded.winnerBidId || item.id === bid.id
                    ? { ...item, status: 'selected' as const }
                    : item,
                ),
              }
            : deal,
        ),
      );
    });
    setAwardBusyId(null);
  };

  const paidDeals = deals.filter(
    (deal) => isAwardedAuction(deal.auction) || deal.payment?.status === 'confirmed',
  );
  const paidIds = new Set(paidDeals.map((deal) => deal.auction.id));
  const openDeals = deals.filter(
    (deal) =>
      isOpenForBid(deal.auction) &&
      !paidIds.has(deal.auction.id) &&
      deal.payment?.status !== 'confirmed' &&
      !deal.bids.some((bid) => isBidSelected(bid, deal.auction.winnerBidId)),
  );
  const openIds = new Set(openDeals.map((deal) => deal.auction.id));
  const endedDeals = deals.filter((deal) => !openIds.has(deal.auction.id));
  const counts: Record<AdvertiserView, number> = {
    open: openDeals.length,
    paid: paidDeals.length,
    proposals: deals.length,
    ended: endedDeals.length,
  };

  useEffect(() => {
    setSelectedCampaignId((current) => {
      if (current && deals.some((deal) => deal.auction.id === current)) {
        return current;
      }
      const firstOpen = deals.find(
        (deal) =>
          isOpenForBid(deal.auction) &&
          !isAwardedAuction(deal.auction) &&
          deal.payment?.status !== 'confirmed' &&
          !deal.bids.some((bid) => isBidSelected(bid, deal.auction.winnerBidId)),
      );
      return firstOpen?.auction.id || deals[0]?.auction.id || '';
    });
  }, [deals]);

  const selectedDeal = deals.find((deal) => deal.auction.id === selectedCampaignId) ?? null;

  const openProposals = (auctionId: string) => {
    setSelectedCampaignId(auctionId);
    setView('proposals');
  };

  return (
    <PageContainer className="flex min-w-0 flex-1 flex-col pt-4 pb-6 sm:pt-5 sm:pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold tracking-wide text-clink-accent">광고주</p>
          <h1 className="mt-1 text-2xl font-bold text-stone-900 sm:text-3xl">내 캠페인</h1>
        </div>
        <Link
          href="/my/credits"
          className="inline-flex h-10 items-center rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          크레딧 충전
        </Link>
      </div>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        진행 중 캠페인, 결제 완료, 제안 현황, 종료된 내역을 나누어 확인할 수 있습니다.
      </p>

      <div
        role="tablist"
        aria-label="캠페인 보기"
        className="mt-5 flex flex-wrap gap-1.5"
      >
        {VIEWS.map((item) => {
          const selected = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setView(item.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
                selected
                  ? 'bg-clink text-white'
                  : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
              )}
            >
              {item.label}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                  selected ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-500',
                )}
              >
                {counts[item.id]}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <AuctionCardSkeleton key={index} />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-medium text-zinc-800">
            {error || '등록한 캠페인이 없습니다'}
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-clink px-4 text-sm font-semibold text-white hover:bg-stone-800"
          >
            오픈 캠페인 둘러보기
          </Link>
        </div>
      ) : (
        <div className="mt-6 min-w-0">
          {view === 'open' ? (
            <OpenCampaignsPanel deals={openDeals} onOpenProposals={openProposals} />
          ) : null}
          {view === 'paid' ? <PaidCampaignsPanel deals={paidDeals} /> : null}
          {view === 'proposals' ? (
            <ProposalStatusPanel
              deals={deals}
              selectedDeal={selectedDeal}
              awardBusyId={awardBusyId}
              onSelect={setSelectedCampaignId}
              onAward={handleAward}
            />
          ) : null}
          {view === 'ended' ? <EndedCampaignsPanel deals={endedDeals} /> : null}
        </div>
      )}
      <CreditChargeModal
        open={chargeNeeded != null}
        neededAmount={chargeNeeded ?? 0}
        onClose={closeCharge}
      />
    </PageContainer>
  );
}

function EmptyLine({ children }: { children: string }) {
  return <p className="mt-2 text-sm text-zinc-400">{children}</p>;
}

function OpenCampaignsPanel({
  deals,
  onOpenProposals,
}: {
  deals: AdvertiserDeal[];
  onOpenProposals: (auctionId: string) => void;
}) {
  if (deals.length === 0) {
    return <EmptyLine>진행 중 캠페인 0건</EmptyLine>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {deals.map((deal) => (
        <AuctionCard
          key={`open-${deal.auction.id}`}
          auction={deal.auction}
          hideBidAction
          footerAction={
            <button
              type="button"
              onClick={() => onOpenProposals(deal.auction.id)}
              className="inline-flex h-10 w-full items-center justify-center rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800"
            >
              제안 현황 보기
            </button>
          }
        />
      ))}
    </div>
  );
}

function PaidCampaignsPanel({ deals }: { deals: AdvertiserDeal[] }) {
  if (deals.length === 0) {
    return <EmptyLine>결제 완료 0건</EmptyLine>;
  }

  return (
    <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
      {deals.map((deal) => (
        <li
          key={`${deal.auction.id}-${deal.payment?.orderId ?? deal.bid?.id ?? 'paid'}`}
          className="rounded-xl border border-clink-peach-strong bg-white px-3.5 py-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <Link
                href={`/auctions/${deal.auction.id}`}
                className="font-semibold text-zinc-950 hover:underline"
              >
                {deal.auction.title}
              </Link>
              <p className="mt-1 text-sm text-zinc-500">
                {deal.bid?.creatorName || '선택된 크리에이터 없음'}
                {deal.bid ? ` · ${formatWon(deal.bid.bidAmount)}` : ''}
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-clink-peach px-2 py-0.5 text-xs font-semibold text-clink">
              {auctionStatusLabel(deal.auction.status)}
            </span>
          </div>
          {deal.bid ? (
            <div className="mt-3">
              <FeeBreakdownCard role="advertiser" amount={deal.bid.bidAmount} />
            </div>
          ) : null}
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm text-zinc-600 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-zinc-400">결제 금액</dt>
              <dd className="font-medium text-zinc-950">
                {formatWon(
                  deal.bid
                    ? describeSettlementAmounts(deal.bid.bidAmount).advertiserCharge
                    : (deal.payment?.amount ?? 0),
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">주문번호</dt>
              <dd className="truncate">{deal.payment?.orderId || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-400">승인 시각</dt>
              <dd>{formatDateTime(deal.payment?.confirmedAt ?? undefined)}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function EndedCampaignsPanel({ deals }: { deals: AdvertiserDeal[] }) {
  if (deals.length === 0) {
    return <EmptyLine>종료된 캠페인 0건</EmptyLine>;
  }

  return (
    <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto pr-1">
      {deals.map((deal) => (
        <li
          key={`ended-${deal.auction.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-3.5 py-3"
        >
          <div className="min-w-0">
            <Link
              href={`/auctions/${deal.auction.id}`}
              className="truncate font-semibold text-zinc-950 hover:underline"
            >
              {deal.auction.title}
            </Link>
            <p className="mt-1 truncate text-sm text-zinc-500">
              {deal.bid?.creatorName || '선정된 크리에이터 없음'}
              {deal.bid ? ` · ${formatWon(deal.bid.bidAmount)}` : ''}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
            {auctionStatusLabel(deal.auction.status)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ProposalStatusPanel({
  deals,
  selectedDeal,
  awardBusyId,
  onSelect,
  onAward,
}: {
  deals: AdvertiserDeal[];
  selectedDeal: AdvertiserDeal | null;
  awardBusyId: string | null;
  onSelect: (auctionId: string) => void;
  onAward: (auction: AuctionItem, bid: BidItem) => void | Promise<void>;
}) {
  if (deals.length === 0) {
    return <EmptyLine>제안 현황을 볼 캠페인이 없습니다.</EmptyLine>;
  }

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,16.5rem)_minmax(0,1fr)]">
      <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1 lg:max-h-[70vh]">
        {deals.map((deal) => {
          const selected = deal.auction.id === selectedDeal?.auction.id;
          return (
            <li key={`pick-${deal.auction.id}`}>
              <button
                type="button"
                onClick={() => onSelect(deal.auction.id)}
                className={cn(
                  'flex w-full items-start justify-between gap-2 rounded-xl border px-3 py-2.5 text-left',
                  selected
                    ? 'border-clink bg-clink-peach/50'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-zinc-950">
                    {deal.auction.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    제안 {deal.bids.length}건
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-zinc-600">
                  {auctionStatusLabel(deal.auction.status)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {selectedDeal ? (
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate text-base font-bold text-zinc-950">
                {selectedDeal.auction.title}
              </h2>
              <p className="mt-0.5 text-sm text-zinc-500">
                {auctionStatusLabel(selectedDeal.auction.status)} · 제안 {selectedDeal.bids.length}건
              </p>
            </div>
            <Link
              href={`/auctions/${selectedDeal.auction.id}#proposals`}
              className="inline-flex h-9 items-center rounded-full border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              상세 페이지로 이동
            </Link>
          </div>
          <BidProposalList
            auction={selectedDeal.auction}
            bids={selectedDeal.bids}
            loading={false}
            error={null}
            busyId={awardBusyId}
            allowAward
            onAward={(bid) => onAward(selectedDeal.auction, bid)}
          />
        </div>
      ) : (
        <EmptyLine>캠페인을 선택하면 제안 현황을 볼 수 있습니다.</EmptyLine>
      )}
    </div>
  );
}
