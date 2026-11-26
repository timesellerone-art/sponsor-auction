'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AuctionCountdown } from '@/components/AuctionCountdown';
import { useAuth } from '@/components/AuthProvider';
import { CreatorRatingBadge } from '@/components/CreatorRatingBadge';
import { TimeslotBidForm } from '@/components/TimeslotBidForm';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON } from '@/lib/access';
import { loginPath } from '@/lib/auth-guard';
import { PLATFORM_LABELS } from '@/lib/platforms';
import { authRequestInit } from '@/lib/auth-request';
import { getTimeSlotById, listTimeSlotBids } from '@/lib/timeslots';
import { formatDateTime, formatViews, formatWon } from '@/lib/utils';
import { isTimeSlotOpen, type TimeSlotBidItem, type TimeSlotItem } from '@/types/timeslot';

export function TimeslotDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user, profileReady } = useAuth();
  const authSettled = Boolean(user) || profileReady;
  const [slot, setSlot] = useState<TimeSlotItem | null>(null);
  const [bids, setBids] = useState<TimeSlotBidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
      setError('크리에이터 상품을 불러오지 못했습니다.');
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

  const isOwner = Boolean(slot?.creatorId && user?.id && slot.creatorId === user.id);
  const slotOpen = Boolean(slot && isTimeSlotOpen(slot));

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/inventory"
        className="inline-flex w-fit items-center gap-1 text-sm font-medium text-zinc-600 hover:text-zinc-950"
      >
        <ArrowLeft className="size-4" aria-hidden />
        크리에이터 상품 목록으로
      </Link>

      {loading ? (
        <div className="mt-6 h-48 animate-pulse rounded-2xl bg-white" />
      ) : !slot ? (
        <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="font-medium text-zinc-800">크리에이터 상품을 찾을 수 없습니다</p>
          {error ? <p className="mt-2 text-sm text-zinc-500">{error}</p> : null}
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          <article className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
            <p className="text-xs font-semibold tracking-wide text-clink-accent">
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
                  {slot.currentHighestBid > 0 ? formatWon(slot.currentHighestBid) : '제안 없음'}
                </p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">예상 조회수</p>
                <p className="font-semibold">{formatViews(slot.expectedViews)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">모집 마감</p>
                <AuctionCountdown deadline={slot.deadline} />
              </div>
              {slot.slotStart ? (
                <div>
                  <p className="text-xs text-zinc-400">진행 시작</p>
                  <p className="font-semibold">{formatDateTime(slot.slotStart)}</p>
                </div>
              ) : null}
              {slot.slotEnd ? (
                <div>
                  <p className="text-xs text-zinc-400">진행 종료</p>
                  <p className="font-semibold">{formatDateTime(slot.slotEnd)}</p>
                </div>
              ) : null}
            </div>
            {!slotOpen ? (
              <p className="mt-6 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                이 상품은 마감되었거나 낙찰되었습니다.
              </p>
            ) : !authSettled ? (
              <div className="mt-6 h-24 animate-pulse rounded-xl bg-zinc-100" aria-hidden />
            ) : isOwner ? (
              <p className="mt-6 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                내가 등록한 크리에이터 상품입니다.
              </p>
            ) : user ? null : (
              <div className="mt-6 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                <p>로그인 후 제안할 수 있습니다.</p>
                <button
                  type="button"
                  onClick={() => {
                    showToast(ACCESS_REASON['auth-required']);
                    router.push(loginPath('auth-required', `/timeslots/${slot.id}`));
                  }}
                  className="mt-2 block text-sm font-semibold text-clink-accent hover:underline"
                >
                  로그인하러 가기
                </button>
              </div>
            )}
          </article>
          {slotOpen && authSettled && user && !isOwner ? <TimeslotBidForm slot={slot} /> : null}

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
            <h2 className="text-lg font-bold text-zinc-950">제안 현황</h2>
            <p className="mt-1 text-sm text-zinc-500">최고가가 위에 표시됩니다.</p>
            {bids.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">아직 제안이 없습니다.</p>
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
                        <span className="rounded-full bg-clink-peach px-2.5 py-1 text-xs font-semibold text-clink-accent">
                          최고 제안가
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-600">{bid.message}</p>
                    <p className="mt-2 text-xs text-zinc-400">{formatDateTime(bid.createdAt)}</p>
                    {isOwner && slotOpen ? (
                      <button
                        type="button"
                        disabled={Boolean(busyId)}
                        onClick={async () => {
                          setBusyId(bid.id);
                          try {
                            const response = await fetch(
                              `/api/timeslots/${slot.id}/award`,
                              await authRequestInit({
                                method: 'POST',
                                body: JSON.stringify({ bidId: bid.id }),
                              }),
                            );
                            const payload = (await response.json().catch(() => null)) as {
                              error?: string;
                              errorMessage?: string;
                            } | null;
                            if (!response.ok) {
                              showToast(payload?.errorMessage || payload?.error || '낙찰하지 못했습니다.');
                              return;
                            }
                            showToast('낙찰했습니다.', 'success');
                            window.dispatchEvent(new Event('timeslots:changed'));
                          } finally {
                            setBusyId(null);
                          }
                        }}
                        className="mt-3 inline-flex h-9 items-center rounded-full bg-clink px-3 text-xs font-semibold text-white hover:bg-stone-800 disabled:bg-zinc-300"
                      >
                        {busyId === bid.id ? '선정 중...' : '이 제안 선정'}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
