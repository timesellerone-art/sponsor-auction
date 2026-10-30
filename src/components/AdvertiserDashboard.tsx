'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AuctionCard, AuctionCardSkeleton } from '@/components/AuctionCard';
import { PageContainer } from '@/components/PageContainer';
import { BidProposalList } from '@/components/BidProposalList';
import { PaymentCheckoutModal } from '@/components/PaymentCheckoutModal';
import { useActionLock } from '@/hooks/useActionLock';
import { useAwardCheckout } from '@/hooks/useAwardCheckout';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { getAdvertiserDashboard } from '@/lib/dashboard';
import { auctionStatusLabel } from '@/lib/status-labels';
import { formatDateTime, formatWon } from '@/lib/utils';
import type { AdvertiserDeal } from '@/types/dashboard';
import type { AuctionItem, BidItem } from '@/types/auction';

export function AdvertiserDashboard() {
  const { user, requireAdvertiser } = useRequireAuth();
  const userId = user?.id ?? '';
  const userRef = useRef(user);
  const [deals, setDeals] = useState<AdvertiserDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awardBusyId, setAwardBusyId] = useState<string | null>(null);
  const { run: runAward } = useActionLock();
  const { checkout, startCheckout, closeCheckout } = useAwardCheckout();

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
        setError(list.length === 0 ? '등록한 역경매가 없습니다.' : result.error);
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

    await runAward(bid.id, async () => {
      setAwardBusyId(bid.id);
      try {
        await startCheckout(auction, bid);
      } finally {
        setAwardBusyId(null);
      }
    });
  };

  const paidDeals = deals.filter(
    (deal) => deal.auction.status === 'completed' || deal.payment?.status === 'confirmed',
  );
  const openDeals = deals.filter(
    (deal) => deal.auction.status === 'active' && !deal.auction.isBlind,
  );

  return (
    <PageContainer className="flex min-w-0 flex-1 flex-col py-6 sm:py-10">
      <p className="text-sm font-semibold tracking-wide text-teal-800">광고주</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">내 역경매</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        등록한 캠페인과 결제 완료된 낙찰 내역을 확인하고, 진행 중인 제안은 여기서 바로
        낙찰할 수 있습니다.
      </p>

      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <AuctionCardSkeleton key={index} />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-medium text-zinc-800">
            {error || '등록한 역경매가 없습니다'}
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            역경매 둘러보기
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col space-y-8 pb-4 sm:space-y-12">
          <section className="mb-8 min-w-0 pb-8">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">진행 중인 역경매</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  입찰이 열려 있는 내 캠페인입니다. 제안을 확인하고 낙찰할 수 있습니다.
                </p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                {openDeals.length}건
              </span>
            </div>
            {openDeals.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
                지금 진행 중인 내 역경매가 없습니다.
              </div>
            ) : (
              <div className="mt-4 mb-2 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {openDeals.map((deal) => (
                  <div key={`open-${deal.auction.id}`} className="flex min-w-0 flex-col gap-3">
                    <AuctionCard auction={deal.auction} hideBidAction />
                    <Link
                      href={`/auctions/${deal.auction.id}#proposals`}
                      className="inline-flex h-10 w-full shrink-0 items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
                    >
                      입찰 현황 보기
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="mt-8 min-w-0 pt-2">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">결제 완료 목록</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  payments · auctions · bids 기준으로 승인된 결제를 보여 줍니다.
                </p>
              </div>
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                {paidDeals.length}건
              </span>
            </div>
            {paidDeals.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
                아직 결제 완료된 역경매가 없습니다.
              </div>
            ) : (
              <ul className="mt-4 flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
                {paidDeals.map((deal) => (
                  <li
                    key={`${deal.auction.id}-${deal.payment?.orderId ?? deal.bid?.id ?? 'paid'}`}
                    className="rounded-2xl border border-teal-100 bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
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
                      <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-900">
                        {auctionStatusLabel(deal.auction.status)}
                      </span>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-2 text-sm text-zinc-600 sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-zinc-400">결제 금액</dt>
                        <dd className="font-medium text-zinc-950">
                          {formatWon(deal.payment?.amount ?? 0)}
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
            )}
          </section>

          <section className="flex flex-col gap-8">
            <h2 className="text-lg font-bold text-zinc-950">내 캠페인</h2>
            {deals.map((deal) => (
              <div
                key={deal.auction.id}
                className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]"
              >
                <div className="min-w-0">
                  <AuctionCard auction={deal.auction} hideBidAction />
                  <Link
                    href={`/auctions/${deal.auction.id}#proposals`}
                    className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full border border-zinc-200 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                  >
                    상세 페이지로 이동
                  </Link>
                </div>
                <BidProposalList
                  auction={deal.auction}
                  bids={deal.bids}
                  loading={false}
                  error={null}
                  busyId={awardBusyId}
                  allowAward
                  onAward={(bid) => handleAward(deal.auction, bid)}
                />
              </div>
            ))}
          </section>
        </div>
      )}
      <PaymentCheckoutModal
        open={Boolean(checkout)}
        checkout={checkout}
        onClose={closeCheckout}
      />
    </PageContainer>
  );
}
