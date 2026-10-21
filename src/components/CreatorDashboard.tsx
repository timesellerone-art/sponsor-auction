'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuctionCardSkeleton } from '@/components/AuctionCard';
import { CreateTimeslotModal } from '@/components/CreateTimeslotModal';
import { PageContainer } from '@/components/PageContainer';
import { useAuth } from '@/components/AuthProvider';
import { getCreatorDashboard } from '@/lib/dashboard';
import { closeTimeSlot, listTimeSlots } from '@/lib/timeslots';
import { CREATOR_FEE_RATE } from '@/lib/fees';
import { auctionStatusLabel, bidStatusLabel } from '@/lib/status-labels';
import { cn, formatDateTime, formatWon } from '@/lib/utils';
import type { TimeSlotItem } from '@/types/timeslot';
import type { CreatorDeal } from '@/types/dashboard';

function creatorPayout(amount: number) {
  return Math.round(amount * (1 - CREATOR_FEE_RATE));
}

export function CreatorDashboard() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<CreatorDeal[]>([]);
  const [slots, setSlots] = useState<TimeSlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createSlotOpen, setCreateSlotOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [result, slotResult] = await Promise.all([
          getCreatorDashboard(user),
          listTimeSlots({ creatorId: user.id }),
        ]);
        if (cancelled) {
          return;
        }
        const list = Array.isArray(result.data) ? result.data : [];
        setDeals(list);
        setSlots(slotResult.data);
        setError(list.length === 0 && slotResult.data.length === 0 ? '제출한 제안이 없습니다.' : result.error);
      } catch {
        if (!cancelled) {
          setDeals([]);
          setError('제안 목록을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    const onChanged = () => {
      void load();
    };
    window.addEventListener('auctions:changed', onChanged);
    window.addEventListener('timeslots:changed', onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('auctions:changed', onChanged);
      window.removeEventListener('timeslots:changed', onChanged);
    };
  }, [user]);

  const wonDeals = deals.filter((deal) => deal.bid.status === 'selected');
  const pendingDeals = deals.filter((deal) => deal.bid.status !== 'selected');

  return (
    <PageContainer className="flex min-w-0 flex-1 flex-col py-6 sm:py-10">
      <p className="text-sm font-semibold tracking-wide text-teal-800">크리에이터</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">내 제안</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        타임슬롯 인벤토리와 제출한 입찰, 낙찰·결제 완료된 캠페인을 한곳에서 확인할 수 있습니다.
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setCreateSlotOpen(true)}
          className="inline-flex h-10 items-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
        >
          타임슬롯 등록
        </button>
      </div>

      {slots.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-lg font-bold text-zinc-950">내 타임슬롯</h2>
          <ul className="mt-4 flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
            {slots.map((slot) => (
              <li key={slot.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/inventory/${slot.id}`} className="font-semibold hover:underline">
                      {slot.title}
                    </Link>
                    <p className="mt-1 text-sm text-zinc-500">
                      최고가 {slot.currentHighestBid > 0 ? formatWon(slot.currentHighestBid) : '없음'} · 입찰{' '}
                      {slot.bidsCount}
                    </p>
                  </div>
                  {slot.status === 'open' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const result = await closeTimeSlot(slot.id, user?.id);
                        if (result.error) {
                          return;
                        }
                        window.dispatchEvent(new Event('timeslots:changed'));
                      }}
                      className="text-xs font-semibold text-zinc-600 hover:underline"
                    >
                      마감
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-400">{slot.status === 'awarded' ? '낙찰' : '마감'}</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <AuctionCardSkeleton key={index} />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-medium text-zinc-800">
            {error || '제출한 제안이 없습니다'}
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            역경매 둘러보기
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          <section>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">낙찰/결제 완료</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  입찰 상태가 selected 이고 결제가 승인된 항목입니다.
                </p>
              </div>
              <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                {wonDeals.length}건
              </span>
            </div>
            {wonDeals.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
                아직 낙찰·결제 완료된 제안이 없습니다.
              </div>
            ) : (
              <ul className="mt-4 flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
                {wonDeals.map((deal) => (
                  <DealCard key={deal.bid.id} deal={deal} highlight />
                ))}
              </ul>
            )}
          </section>

          <section>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">진행 중인 제안(입찰 중)</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  아직 낙찰되지 않은 pending 상태의 제안입니다.
                </p>
              </div>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                {pendingDeals.length}건
              </span>
            </div>
            {pendingDeals.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
                진행 중인 제안이 없습니다.
              </div>
            ) : (
              <ul className="mt-4 flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
                {pendingDeals.map((deal) => (
                  <DealCard key={`pending-${deal.bid.id}`} deal={deal} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      <CreateTimeslotModal open={createSlotOpen} onClose={() => setCreateSlotOpen(false)} />
    </PageContainer>
  );
}

function DealCard({ deal, highlight = false }: { deal: CreatorDeal; highlight?: boolean }) {
  const paid = deal.bid.status === 'selected';
  const href = deal.auction?.id ? `/auctions/${deal.auction.id}` : '/';

  return (
    <li
      className={cn(
        'rounded-2xl border bg-white p-4 sm:p-5',
        highlight || paid ? 'border-teal-100' : 'border-amber-100',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={href} className="font-semibold text-zinc-950 hover:underline">
            {deal.auction?.title || '연결된 캠페인 없음'}
          </Link>
          <p className="mt-1 text-sm text-zinc-500">
            제안 금액 {formatWon(deal.bid.bidAmount)}
            {paid ? ` · 예상 정산 ${formatWon(creatorPayout(deal.bid.bidAmount))}` : ''}
          </p>
        </div>
        <span
          className={cn(
            'rounded-full px-2.5 py-1 text-xs font-semibold',
            paid ? 'bg-teal-50 text-teal-900' : 'bg-amber-50 text-amber-800',
          )}
        >
          {bidStatusLabel(deal.bid.status, paid)}
        </span>
      </div>
      {deal.bid.proposalText ? (
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-zinc-600">
          {deal.bid.proposalText}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        {deal.auction?.status ? <span>캠페인 {auctionStatusLabel(deal.auction.status)}</span> : null}
        <span>제출 {formatDateTime(deal.bid.createdAt)}</span>
        {deal.payment?.orderId ? <span>주문 {deal.payment.orderId}</span> : null}
      </div>
    </li>
  );
}
