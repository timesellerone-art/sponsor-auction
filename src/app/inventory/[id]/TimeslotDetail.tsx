'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AuctionCountdown } from '@/components/AuctionCountdown';
import { useAuth } from '@/components/AuthProvider';
import { CreatorRatingBadge } from '@/components/CreatorRatingBadge';
import { TimeslotBidModal } from '@/components/TimeslotBidModal';
import { showToast } from '@/components/Toast';
import { isDeadlinePassed } from '@/lib/auction-engine';
import { PLATFORM_LABELS } from '@/lib/platforms';
import { awardTimeSlotBid, getTimeSlotById, listTimeSlotBids } from '@/lib/timeslots';
import { formatDateTime, formatViews, formatWon } from '@/lib/utils';
import type { TimeSlotBidItem, TimeSlotItem } from '@/types/timeslot';

export function TimeslotDetail({ id }: { id: string }) {
  const { user, canCreateAuction, canPlaceBid } = useAuth();
  const [slot, setSlot] = useState<TimeSlotItem | null>(null);
  const [bids, setBids] = useState<TimeSlotBidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidOpen, setBidOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [slotResult, bidResult] = await Promise.all([
        getTimeSlotById(id),
        listTimeSlotBids(id),
      ]);
      setSlot(slotResult.data);
      setError(slotResult.error);
      setBids(bidResult.data);
    } catch {
      setSlot(null);
      setError('타임슬롯을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    const onChanged = () => {
      void load();
    };
    window.addEventListener('timeslots:changed', onChanged);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('timeslots:changed', onChanged);
    };
  }, [load]);

  const [canBid, setCanBid] = useState(false);
  const isOwner = Boolean(slot?.creatorId && user?.id && slot.creatorId === user.id && canPlaceBid);

  useEffect(() => {
    const tick = () => {
      setCanBid(
        Boolean(slot) &&
          slot?.status === 'open' &&
          !slot?.winnerBidId &&
          canCreateAuction &&
          !isDeadlinePassed(slot?.deadline),
      );
    };
    const timer = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [slot, canCreateAuction]);

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/inventory"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-950"
      >
        <ArrowLeft className="size-4" aria-hidden />
        인벤토리로
      </Link>

      {loading ? (
        <div className="mt-6 h-48 animate-pulse rounded-2xl bg-white" />
      ) : !slot ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium text-zinc-800">타임슬롯을 찾을 수 없습니다</p>
          {error ? <p className="mt-2 text-sm text-zinc-500">{error}</p> : null}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
            <p className="text-xs font-semibold tracking-wide text-teal-800">
              {PLATFORM_LABELS[slot.platform]}
            </p>
            <h1 className="mt-2 text-2xl font-bold text-zinc-950">{slot.title}</h1>
            <p className="mt-2 text-sm text-zinc-600">{slot.creatorName}</p>
            <CreatorRatingBadge
              className="mt-1"
              rating={slot.creatorRating}
              completionRate={slot.creatorCompletionRate}
            />
            <p className="mt-4 text-sm leading-6 whitespace-pre-wrap text-zinc-600">
              {slot.description}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-zinc-400">시작가</p>
                <p className="font-semibold">{formatWon(slot.startingPrice)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">현재 최고가</p>
                <p className="font-semibold">
                  {slot.currentHighestBid > 0 ? formatWon(slot.currentHighestBid) : '입찰 없음'}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">예상 조회수</p>
                <p className="font-semibold">{formatViews(slot.expectedViews)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">입찰 마감</p>
                <AuctionCountdown deadline={slot.deadline} />
              </div>
            </div>
            {canBid ? (
              <button
                type="button"
                onClick={() => setBidOpen(true)}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
              >
                입찰하기
              </button>
            ) : (
              <p className="mt-6 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                {slot.status !== 'open' || slot.winnerBidId
                  ? '이 슬롯은 마감되었거나 낙찰되었습니다.'
                  : '광고주 계정으로 입찰할 수 있습니다.'}
              </p>
            )}
          </article>

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
            <h2 className="text-lg font-bold text-zinc-950">입찰 현황</h2>
            <p className="mt-1 text-sm text-zinc-500">최고가가 위에 표시됩니다.</p>
            {bids.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">아직 입찰이 없습니다.</p>
            ) : (
              <ul className="mt-4 flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
                {bids.map((bid) => (
                  <li key={bid.id} className="rounded-xl border border-zinc-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-950">{bid.advertiserName}</p>
                        <p className="mt-1 text-lg font-bold">{formatWon(bid.bidAmount)}</p>
                      </div>
                      {bid.isLeading ? (
                        <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
                          최고 입찰가
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-600">{bid.message}</p>
                    <p className="mt-2 text-xs text-zinc-400">{formatDateTime(bid.createdAt)}</p>
                    {isOwner && slot.status === 'open' ? (
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={async () => {
                          setBusyId(bid.id);
                          try {
                            const result = await awardTimeSlotBid(slot.id, bid.id, user?.id);
                            if (result.error) {
                              showToast(result.error);
                              return;
                            }
                            showToast('낙찰했습니다.', 'success');
                            window.dispatchEvent(new Event('timeslots:changed'));
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="mt-3 inline-flex h-9 items-center rounded-full bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 disabled:bg-zinc-300"
                      >
                        {busyId === bid.id ? '낙찰 중...' : '이 입찰 낙찰'}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      <TimeslotBidModal open={bidOpen} slot={slot} onClose={() => setBidOpen(false)} />
    </div>
  );
}
