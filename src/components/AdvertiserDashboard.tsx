'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AuctionCard, AuctionCardSkeleton } from '@/components/AuctionCard';
import { ListingDeleteButton } from '@/components/ListingDeleteButton';
import { PageContainer } from '@/components/PageContainer';
import { BidProposalList } from '@/components/BidProposalList';
import { FeeBreakdownCard } from '@/components/fee/FeeBreakdownCard';
import { PaymentCheckoutModal } from '@/components/PaymentCheckoutModal';
import { useActionLock } from '@/hooks/useActionLock';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { prepareAwardPayment } from '@/lib/payments/client';
import { showToast } from '@/components/Toast';
import { isOpenForBid } from '@/lib/auction-browse';
import { canOwnerDeleteCampaign } from '@/lib/listing-delete';
import { getAdvertiserDashboard } from '@/lib/dashboard';
import { TimeslotPaymentPanel } from '@/components/TimeslotPaymentPanel';
import { dealDetailHref } from '@/lib/timeslot-deal';
import { auctionStatusLabel } from '@/lib/status-labels';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import { cn, formatDateTime, formatWon } from '@/lib/utils';
import type { AdvertiserDeal } from '@/types/dashboard';
import type { PreparePaymentResult } from '@/types/payment';
import { isAwardedAuction, isBidSelected, type AuctionItem, type BidItem } from '@/types/auction';
import type { TimeSlotBidItem, TimeSlotItem } from '@/types/timeslot';

type AdvertiserView = 'open' | 'paid' | 'proposals' | 'ended';

const VIEWS: { id: AdvertiserView; label: string }[] = [
  { id: 'open', label: '진행 중 캠페인' },
  { id: 'paid', label: '결제 완료 목록' },
  { id: 'proposals', label: '캠페인별 지원 현황' },
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
  const [checkout, setCheckout] = useState<PreparePaymentResult | null>(null);

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
    window.addEventListener('timeslots:changed', onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('auctions:changed', onChanged);
      window.removeEventListener('timeslots:changed', onChanged);
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
      const prepared = await prepareAwardPayment({ auction, bid, kind: 'campaign' });
      if (prepared.error || !prepared.data) {
        showToast(prepared.error || '토스페이먼츠 단건 에스크로 결제를 준비하지 못했습니다.');
        return;
      }
      setCheckout(prepared.data);
    });
    setAwardBusyId(null);
  };

  const paidDeals = deals.filter((deal) => {
    if (deal.kind === 'timeslot') {
      return deal.payment?.status === 'confirmed' || Boolean(deal.fulfillment?.paidAt);
    }
    return isAwardedAuction(deal.auction) || deal.payment?.status === 'confirmed';
  });
  const awaitingPayDeals = deals.filter(isTimeslotAwaitingAdvertiserPay);
  const paidIds = new Set(paidDeals.map((deal) => deal.auction.id));
  const awaitingPayIds = new Set(awaitingPayDeals.map((deal) => deal.auction.id));
  const openDeals = deals.filter(
    (deal) =>
      isOpenForBid(deal.auction) &&
      !paidIds.has(deal.auction.id) &&
      !awaitingPayIds.has(deal.auction.id) &&
      deal.payment?.status !== 'confirmed' &&
      !deal.bids.some((bid) => isBidSelected(bid, deal.auction.winnerBidId)),
  );
  const openIds = new Set(openDeals.map((deal) => deal.auction.id));
  const endedDeals = deals.filter(
    (deal) => !openIds.has(deal.auction.id) && !awaitingPayIds.has(deal.auction.id),
  );
  const campaignDeals = deals.filter((deal) => deal.kind !== 'timeslot');
  const counts: Record<AdvertiserView, number> = {
    open: openDeals.length,
    paid: paidDeals.length,
    proposals: campaignDeals.length,
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
      </div>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        진행 중 캠페인, 결제 완료, 지원 현황, 종료된 내역을 나누어 확인할 수 있습니다. 크리에이터
        선정 후 확정 금액 1건을 토스페이먼츠 에스크로로 결제합니다.
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
        <>
          {awaitingPayDeals.length > 0 ? (
            <section className="mt-6 min-w-0">
              <h2 className="text-base font-bold text-zinc-950">결제 대기 크리에이터 상품</h2>
              <p className="mt-1 text-sm text-zinc-500">
                선정된 신청에 대해 사전 확정 용역비 + 수수료 15% + 부가세 10%를 토스페이먼츠 단건
                에스크로로 결제하면 거래가 진행됩니다.
              </p>
              <ul className="mt-3 flex flex-col gap-3">
                {awaitingPayDeals.map((deal) => {
                  const target = timeslotPayTargetFromDeal(deal);
                  if (!target) {
                    return null;
                  }
                  return (
                    <li key={`pay-${deal.auction.id}`}>
                      <TimeslotPaymentPanel
                        slot={target.slot}
                        bid={target.bid}
                        onPaid={() => {
                          window.dispatchEvent(new Event('timeslots:changed'));
                          window.dispatchEvent(new Event('auctions:changed'));
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          <div className="mt-6 min-w-0">
            {view === 'open' ? (
              <OpenCampaignsPanel deals={openDeals} onOpenProposals={openProposals} />
            ) : null}
            {view === 'paid' ? <PaidCampaignsPanel deals={paidDeals} /> : null}
            {view === 'proposals' ? (
              <ProposalStatusPanel
                deals={campaignDeals}
                selectedDeal={selectedDeal?.kind === 'timeslot' ? campaignDeals[0] ?? null : selectedDeal}
                awardBusyId={awardBusyId}
                onSelect={setSelectedCampaignId}
                onAward={handleAward}
              />
            ) : null}
            {view === 'ended' ? <EndedCampaignsPanel deals={endedDeals} /> : null}
          </div>
        </>
      )}
      <PaymentCheckoutModal
        open={Boolean(checkout)}
        checkout={checkout}
        onClose={() => setCheckout(null)}
      />
    </PageContainer>
  );
}

function isTimeslotAwaitingAdvertiserPay(deal: AdvertiserDeal) {
  if (deal.kind !== 'timeslot' || !deal.bid) {
    return false;
  }
  const selected =
    deal.auction.winnerBidId === deal.bid.id || isBidSelected(deal.bid, deal.auction.winnerBidId);
  if (!selected) {
    return false;
  }
  return deal.payment?.status !== 'confirmed' && !deal.fulfillment?.paidAt;
}

function timeslotPayTargetFromDeal(deal: AdvertiserDeal): {
  slot: TimeSlotItem;
  bid: TimeSlotBidItem;
} | null {
  if (deal.kind !== 'timeslot' || !deal.bid) {
    return null;
  }
  const auction = deal.auction;
  const bid = deal.bid;
  return {
    slot: {
      id: auction.id,
      creatorId: auction.authorId ?? null,
      creatorName: auction.authorName,
      title: auction.title,
      platform: auction.platform,
      description: auction.description,
      expectedViews: 0,
      startingPrice: auction.budget,
      currentHighestBid: auction.highestBidAmount || bid.bidAmount,
      bidsCount: auction.bidsCount || 1,
      slotStart: '',
      slotEnd: '',
      deadline: auction.deadline,
      status: 'awarded',
      winnerBidId: auction.winnerBidId,
      paidAt: deal.fulfillment?.paidAt ?? null,
      deliveryUrl: deal.fulfillment?.deliveryUrl ?? null,
      deliveredAt: deal.fulfillment?.deliveredAt ?? null,
      purchaseConfirmedAt: deal.fulfillment?.purchaseConfirmedAt ?? null,
      createdAt: auction.createdAt,
    },
    bid: {
      id: bid.id,
      timeSlotId: auction.id,
      advertiserId: bid.bidderId ?? null,
      advertiserName: bid.bidderName || '',
      bidAmount: bid.bidAmount,
      message: bid.proposalText || '',
      createdAt: bid.createdAt,
    },
  };
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
      {deals.map((deal) =>
        deal.kind === 'timeslot' ? (
          <article
            key={`open-${deal.auction.id}`}
            className="flex flex-col rounded-2xl border border-zinc-200 bg-white px-4 py-4"
          >
            <p className="text-xs font-semibold tracking-wide text-clink-accent">크리에이터 상품</p>
            <Link
              href={dealDetailHref('timeslot', deal.auction.id)}
              className="mt-1 font-semibold text-zinc-950 hover:underline"
            >
              {deal.auction.title}
            </Link>
            <p className="mt-1 text-sm text-zinc-500">
              {deal.bid ? `확정 지급액 ${formatWon(deal.bid.bidAmount)}` : '신청 대기'}
            </p>
            <Link
              href={dealDetailHref('timeslot', deal.auction.id)}
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800"
            >
              상세 페이지로 이동
            </Link>
          </article>
        ) : (
          <AuctionCard
            key={`open-${deal.auction.id}`}
            auction={deal.auction}
            hideBidAction
            footerAction={
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => onOpenProposals(deal.auction.id)}
                  className="inline-flex h-10 w-full items-center justify-center rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800"
                >
                  지원 현황 보기
                </button>
                {canOwnerDeleteCampaign(deal.auction) ? (
                  <ListingDeleteButton kind="campaign" id={deal.auction.id} className="inline-flex h-10 w-full items-center justify-center rounded-full border border-rose-200 text-sm font-semibold text-rose-700 hover:bg-rose-50" />
                ) : null}
              </div>
            }
          />
        ),
      )}
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
                href={dealDetailHref(deal.kind, deal.auction.id)}
                className="font-semibold text-zinc-950 hover:underline"
              >
                {deal.kind === 'timeslot' ? `[상품] ${deal.auction.title}` : deal.auction.title}
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
          {deal.kind === 'timeslot' ? (
            <p className="mt-2 text-sm text-zinc-500">
              {deal.fulfillment?.purchaseConfirmedAt
                ? '구매 확정 · 정산 생성됨'
                : deal.fulfillment?.deliveredAt || deal.fulfillment?.deliveryUrl
                  ? '결과물 납품됨 · 구매 확정 필요'
                  : '진행 중 · 에스크로 예치 · 크리에이터 납품 대기'}
            </p>
          ) : null}
          {deal.kind === 'timeslot' &&
          (deal.fulfillment?.deliveredAt || deal.fulfillment?.deliveryUrl) &&
          !deal.fulfillment?.purchaseConfirmedAt ? (
            <Link
              href={dealDetailHref('timeslot', deal.auction.id)}
              className="mt-3 inline-flex h-9 items-center rounded-full bg-clink px-3 text-xs font-semibold text-white hover:bg-stone-800"
            >
              구매 확정하기
            </Link>
          ) : null}
          {deal.bid ? (
            <div className="mt-3">
              <FeeBreakdownCard
                role="advertiser"
                amount={deal.bid.bidAmount}
                dealKind={deal.kind}
                dealTitle={deal.auction.title}
                counterpartyName={deal.bid.creatorName}
              />
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
              href={dealDetailHref(deal.kind, deal.auction.id)}
              className="truncate font-semibold text-zinc-950 hover:underline"
            >
              {deal.kind === 'timeslot' ? `[상품] ${deal.auction.title}` : deal.auction.title}
            </Link>
            <p className="mt-1 truncate text-sm text-zinc-500">
              {deal.bid?.creatorName || '선정된 크리에이터 없음'}
              {deal.bid ? ` · ${formatWon(deal.bid.bidAmount)}` : ''}
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
            {deal.kind === 'timeslot' &&
            deal.auction.winnerBidId &&
            deal.bid &&
            deal.bid.id !== deal.auction.winnerBidId
              ? '미선정'
              : isTimeslotAwaitingAdvertiserPay(deal)
                ? '결제 대기'
                : auctionStatusLabel(deal.auction.status)}
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
    return <EmptyLine>지원 현황을 볼 캠페인이 없습니다.</EmptyLine>;
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
                    지원 {deal.bids.length}건
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
                {auctionStatusLabel(selectedDeal.auction.status)} · 지원 {selectedDeal.bids.length}건
              </p>
            </div>
            <Link
              href={
                selectedDeal.kind === 'timeslot'
                  ? dealDetailHref('timeslot', selectedDeal.auction.id)
                  : `/auctions/${selectedDeal.auction.id}#proposals`
              }
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
            allowAward={selectedDeal.kind !== 'timeslot'}
            onAward={(bid) => onAward(selectedDeal.auction, bid)}
          />
        </div>
      ) : (
        <EmptyLine>캠페인을 선택하면 지원 현황을 볼 수 있습니다.</EmptyLine>
      )}
    </div>
  );
}
