'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { AuctionCountdown } from '@/components/AuctionCountdown';
import { useAuth } from '@/components/AuthProvider';
import { ConfirmModal } from '@/components/ConfirmModal';
import { CreatorRatingBadge } from '@/components/CreatorRatingBadge';
import { TimeslotBidForm } from '@/components/TimeslotBidForm';
import { TimeslotPaymentPanel } from '@/components/TimeslotPaymentPanel';
import { showToast } from '@/components/Toast';
import { ACCESS_REASON, TIMESLOT_APPLY_ADVERTISER_ONLY } from '@/lib/access';
import { loginPath } from '@/lib/auth-guard';
import { useActingMemberRole } from '@/hooks/useActingMemberRole';
import {
  campaignCategoryLabel,
  campaignCoverUrl,
  displayCampaignDescription,
  platformBadgeLabel,
  resolveCampaignCategory,
} from '@/lib/campaign-presentation';
import { PLATFORM_LABELS } from '@/lib/platforms';
import { authRequestInit } from '@/lib/auth-request';
import { BID_STATUS_LABEL } from '@/lib/status-labels';
import { getTimeSlotById, listTimeSlotBids } from '@/lib/timeslots';
import { formatDateTime, formatViews, formatWon } from '@/lib/utils';
import { hasAuthRole, type SessionUser } from '@/types/auth';
import {
  isTimeSlotOpen,
  isTimeslotAwaitingPayment,
  isTimeslotEscrowed,
  type TimeSlotBidItem,
  type TimeSlotItem,
} from '@/types/timeslot';

function mergeTimeslotBids(current: TimeSlotBidItem[], incoming: TimeSlotBidItem[]) {
  const byId = new Map<string, TimeSlotBidItem>();
  for (const bid of current) {
    byId.set(bid.id, bid);
  }
  for (const bid of incoming) {
    byId.set(bid.id, bid);
  }
  const list = [...byId.values()];
  const leading = Math.max(0, ...list.map((item) => item.bidAmount));
  return list
    .map((item) => ({
      ...item,
      isLeading: leading > 0 && item.bidAmount === leading,
    }))
    .sort((left, right) => right.bidAmount - left.bidAmount);
}

function isMyTimeslotBid(
  bid: TimeSlotBidItem,
  user: Pick<SessionUser, 'id' | 'name'> | null | undefined,
) {
  if (!user?.id) {
    return false;
  }
  if (bid.advertiserId && bid.advertiserId === user.id) {
    return true;
  }
  return !bid.advertiserId && Boolean(user.name) && bid.advertiserName === user.name;
}

export function TimeslotDetail({ id }: { id: string }) {
  const router = useRouter();
  const { user, profileReady } = useAuth();
  const actingRole = useActingMemberRole();
  const authSettled = Boolean(user) || profileReady;
  const [slot, setSlot] = useState<TimeSlotItem | null>(null);
  const [bids, setBids] = useState<TimeSlotBidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingBid, setPendingBid] = useState<TimeSlotBidItem | null>(null);
  const [deliveryUrl, setDeliveryUrl] = useState('');
  const [fulfillBusy, setFulfillBusy] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const encodedId = encodeURIComponent(id);
      const [slotRes, bidRes] = await Promise.all([
        fetch(`/api/timeslots/${encodedId}`, { cache: 'no-store' }).catch(() => null),
        fetch(`/api/timeslots/${encodedId}/bids`, { cache: 'no-store' }).catch(() => null),
      ]);
      const slotJson = slotRes
        ? ((await slotRes.json().catch(() => null)) as {
            data?: TimeSlotItem | null;
            error?: string;
          } | null)
        : null;
      const bidJson = bidRes
        ? ((await bidRes.json().catch(() => null)) as {
            data?: TimeSlotBidItem[];
            error?: string;
          } | null)
        : null;
      const slotFromApi = slotRes?.ok ? slotJson?.data ?? null : null;
      const bidsFromApi = bidRes?.ok && Array.isArray(bidJson?.data) ? bidJson.data : null;
      const [slotFallback, bidFallback] =
        slotFromApi && bidsFromApi
          ? [null, null]
          : await Promise.all([
              slotFromApi ? Promise.resolve(null) : getTimeSlotById(id),
              bidsFromApi ? Promise.resolve(null) : listTimeSlotBids(id),
            ]);
      const slotResult = {
        data: slotFromApi ?? slotFallback?.data ?? null,
        error: slotFromApi ? null : slotFallback?.error ?? slotJson?.error ?? null,
      };
      const incoming = bidsFromApi ?? (Array.isArray(bidFallback?.data) ? bidFallback.data : []);
      setBids((current) => mergeTimeslotBids(silent ? current : [], incoming));
      setDeliveryUrl((current) => {
        const next = slotFromApi ?? slotFallback?.data ?? null;
        const fromServer = next?.deliveryUrl?.trim() || '';
        if (fromServer) {
          return fromServer;
        }
        return silent ? current : '';
      });
      setSlot((current) => {
        const next = slotResult.data;
        if (!next) {
          return silent ? current : null;
        }
        const highest = Math.max(
          next.currentHighestBid,
          ...incoming.map((item) => item.bidAmount),
          silent && current ? current.currentHighestBid : 0,
        );
        const count = Math.max(
          next.bidsCount,
          incoming.length,
          silent && current ? current.bidsCount : 0,
        );
        return { ...next, currentHighestBid: highest, bidsCount: count };
      });
      setError(slotResult.error);
    } catch {
      if (!silent) {
        setSlot(null);
        setError('크리에이터 상품을 불러오지 못했습니다.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    const onChanged = () => {
      void load(true);
    };
    window.addEventListener('timeslots:changed', onChanged);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('timeslots:changed', onChanged);
    };
  }, [load]);

  const isOwner = Boolean(slot?.creatorId && user?.id && slot.creatorId === user.id);
  const isCreatorActing = actingRole === 'creator';
  const isAdvertiserActing = Boolean(
    actingRole === 'advertiser' &&
      user &&
      (hasAuthRole(user, 'advertiser') || hasAuthRole(user, 'admin')),
  );
  const slotOpen = Boolean(slot && isTimeSlotOpen(slot));
  const myBid = user ? bids.find((bid) => isMyTimeslotBid(bid, user)) ?? null : null;
  const alreadyBid = Boolean(myBid);
  const winnerBid = slot?.winnerBidId
    ? bids.find((item) => item.id === slot.winnerBidId) ?? null
    : null;
  const isWinningAdvertiser = Boolean(
    winnerBid && user?.id && winnerBid.advertiserId === user.id,
  );
  const delivered = Boolean(slot?.deliveredAt || slot?.deliveryUrl);
  const purchaseConfirmed = Boolean(slot?.purchaseConfirmedAt);
  const awaitingPayment = Boolean(slot && isTimeslotAwaitingPayment(slot));
  const slotCategoryId = slot
    ? resolveCampaignCategory({
        title: slot.title,
        description: slot.description,
        category: slot.category,
      })
    : null;
  const slotCover = slot
    ? campaignCoverUrl({
        id: slot.id,
        title: slot.title,
        description: slot.description,
        imageUrl: slot.imageUrl,
        category: slot.category,
      })
    : '';
  const slotCategoryBadge = slot
    ? slotCategoryId
      ? `${campaignCategoryLabel(slotCategoryId)} · ${platformBadgeLabel(slot.platform)}`
      : PLATFORM_LABELS[slot.platform]
    : '';
  const escrowed = Boolean(slot && isTimeslotEscrowed(slot));
  const awardedClosed = Boolean(slot && !slotOpen);

  const handleBidSubmitted = (bid?: TimeSlotBidItem | null) => {
    if (bid) {
      setBids((current) => {
        const next = mergeTimeslotBids(current, [bid]);
        setSlot((currentSlot) =>
          currentSlot
            ? {
                ...currentSlot,
                currentHighestBid: Math.max(currentSlot.currentHighestBid, bid.bidAmount),
                bidsCount: Math.max(currentSlot.bidsCount, next.length),
              }
            : currentSlot,
        );
        return next;
      });
    }
    void load(true);
  };

  const awardBid = async (bid: TimeSlotBidItem) => {
    if (!slot || busyId) {
      return;
    }
    setBusyId(bid.id);
    try {
      const response = await fetch(
        `/api/timeslots/${encodeURIComponent(slot.id)}/award`,
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({ bidId: bid.id }),
        }),
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        errorMessage?: string;
        errorCode?: string;
      } | null;
      if (!response.ok) {
        showToast(payload?.errorMessage || payload?.error || '선정하지 못했습니다.');
        return;
      }
      showToast('제안을 선정했습니다. 광고주 결제를 기다립니다.', 'success');
      window.dispatchEvent(new Event('timeslots:changed'));
      window.dispatchEvent(new Event('auctions:changed'));
      window.dispatchEvent(new Event('payouts:changed'));
      void load(true);
    } finally {
      setBusyId(null);
    }
  };

  const submitDelivery = async () => {
    if (!slot || fulfillBusy) {
      return;
    }
    setFulfillBusy(true);
    try {
      const response = await fetch(
        `/api/timeslots/${encodeURIComponent(slot.id)}/deliver`,
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({ deliveryUrl }),
        }),
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: TimeSlotItem;
        error?: string;
        errorMessage?: string;
      } | null;
      if (!response.ok) {
        showToast(payload?.errorMessage || payload?.error || '납품하지 못했습니다.');
        return;
      }
      if (payload?.data) {
        setSlot(payload.data);
      }
      showToast('결과물을 납품했습니다.', 'success');
      window.dispatchEvent(new Event('timeslots:changed'));
      window.dispatchEvent(new Event('payouts:changed'));
      void load(true);
    } finally {
      setFulfillBusy(false);
    }
  };

  const submitPurchaseConfirm = async () => {
    if (!slot || fulfillBusy) {
      return;
    }
    setFulfillBusy(true);
    try {
      const response = await fetch(
        `/api/timeslots/${encodeURIComponent(slot.id)}/confirm`,
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({}),
        }),
      );
      const payload = (await response.json().catch(() => null)) as {
        data?: TimeSlotItem;
        error?: string;
        errorMessage?: string;
      } | null;
      if (!response.ok) {
        showToast(payload?.errorMessage || payload?.error || '구매 확정하지 못했습니다.');
        return;
      }
      if (payload?.data) {
        setSlot(payload.data);
      }
      showToast('구매를 확정했습니다. 정산이 생성되었습니다.', 'success');
      window.dispatchEvent(new Event('timeslots:changed'));
      window.dispatchEvent(new Event('auctions:changed'));
      window.dispatchEvent(new Event('payouts:changed'));
      void load(true);
    } finally {
      setFulfillBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/timeslots"
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
          <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
            <div className="relative h-52 overflow-hidden bg-stone-200 sm:h-64">
              <img
                src={slotCover}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
              <div className="absolute inset-x-4 top-4 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md">
                  {slotCategoryBadge}
                </span>
              </div>
            </div>
            <div className="p-4 sm:p-6">
            <h1 className="text-2xl font-bold text-zinc-950">{slot.title}</h1>
            <p className="mt-2 text-sm text-zinc-600">{slot.creatorName}</p>
            <CreatorRatingBadge
              className="mt-1"
              rating={slot.creatorRating}
              completionRate={slot.creatorCompletionRate}
            />
            <p className="mt-4 text-sm leading-6 whitespace-pre-wrap text-zinc-600">
              {displayCampaignDescription(slot.description)}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-zinc-400">캠페인 단가</p>
                <p className="font-semibold">{formatWon(slot.startingPrice)}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-400">지원 수</p>
                <p className="font-semibold">{slot.bidsCount ?? 0}건</p>
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
                {awaitingPayment
                  ? '선정됨 · 광고주 결제 대기'
                  : slot.winnerBidId
                    ? '선정된 상품입니다.'
                    : '이 상품은 마감되었거나 선정되었습니다.'}
              </p>
            ) : !authSettled ? (
              <div className="mt-6 h-24 animate-pulse rounded-xl bg-zinc-100" aria-hidden />
            ) : isOwner ? (
              <p className="mt-6 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                내가 등록한 크리에이터 상품입니다.
              </p>
            ) : isAdvertiserActing ? null : isCreatorActing ? (
              <div className="mt-6">
                <button
                  type="button"
                  onClick={() => showToast(TIMESLOT_APPLY_ADVERTISER_ONLY)}
                  className="inline-flex h-11 w-full items-center justify-center rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800"
                >
                  광고주 전용 신청
                </button>
                <p className="mt-2 text-center text-xs text-zinc-500">
                  {TIMESLOT_APPLY_ADVERTISER_ONLY}
                </p>
              </div>
            ) : (
              <div className="mt-6 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
                <p>로그인 후 신청할 수 있습니다.</p>
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
            </div>
          </article>
          {slotOpen && authSettled && isAdvertiserActing && !isOwner ? (
            alreadyBid ? (
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
                <h2 className="text-base font-bold text-zinc-950">크리에이터 상품 신청</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  이미 이 상품에 신청했습니다. 아래 현황에서 확인할 수 있습니다.
                </p>
                {myBid ? (
                  <p className="mt-2 text-sm font-semibold text-zinc-950">
                    확정 지급액 {formatWon(myBid.bidAmount)}
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled
                  className="mt-4 inline-flex h-11 w-full cursor-not-allowed items-center justify-center rounded-full bg-zinc-300 text-sm font-semibold text-zinc-500"
                >
                  신청 완료
                </button>
              </div>
            ) : (
              <TimeslotBidForm
                slot={slot}
                onSubmitted={handleBidSubmitted}
              />
            )
          ) : null}

          <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-bold text-zinc-950">신청 현황</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  접수된 단가 {Number(slot.startingPrice || 0).toLocaleString('ko-KR')}원입니다.
                </p>
              </div>
              {awardedClosed && winnerBid ? (
                <span className="rounded-full bg-clink-peach px-2.5 py-1 text-xs font-semibold text-clink-accent">
                  {awaitingPayment ? '결제 대기' : '선정된 상품입니다'}
                </span>
              ) : null}
            </div>
            {awardedClosed && winnerBid ? (
              <div className="mt-4 rounded-xl border border-clink-peach-strong bg-clink-peach px-4 py-3 text-sm text-clink">
                <p className="font-semibold">선택된 광고주</p>
                <p className="mt-1">
                  {winnerBid.advertiserName || '이름 없음'} · {formatWon(winnerBid.bidAmount)}
                </p>
              </div>
            ) : null}
            {bids.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">아직 신청이 없습니다.</p>
            ) : (
              <ul className="mt-4 flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
                {bids.map((bid) => {
                  const winner = Boolean(slot.winnerBidId && slot.winnerBidId === bid.id);
                  const mine = isMyTimeslotBid(bid, user);
                  return (
                    <li
                      key={bid.id}
                      className={
                        mine
                          ? 'rounded-xl border border-clink-peach-strong bg-clink-peach/30 p-4'
                          : 'rounded-xl border border-zinc-200 p-4'
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-zinc-950">
                            {bid.advertiserName}
                            {mine ? (
                              <span className="ml-2 text-xs font-semibold text-clink-accent">내 신청</span>
                            ) : null}
                          </p>
                          <p className="mt-1 text-lg font-bold">{formatWon(bid.bidAmount)}</p>
                        </div>
                        {winner ? (
                          <span className="shrink-0 rounded-full bg-clink-peach px-3 py-1 text-xs font-semibold text-clink-accent">
                            {BID_STATUS_LABEL.selected}
                          </span>
                        ) : awardedClosed ? (
                          <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                            미선정
                          </span>
                        ) : mine ? (
                          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold text-clink-accent">
                            신청 완료
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-sm whitespace-pre-wrap text-zinc-600">{bid.message}</p>
                      <p className="mt-2 text-xs text-zinc-400">{formatDateTime(bid.createdAt)}</p>
                      {isOwner && slotOpen ? (
                        <button
                          type="button"
                          disabled={Boolean(busyId)}
                          onClick={() => setPendingBid(bid)}
                          className="mt-3 inline-flex h-9 items-center rounded-full bg-clink px-3 text-xs font-semibold text-white hover:bg-stone-800 disabled:bg-zinc-300"
                        >
                          {busyId === bid.id ? '선정 중...' : '광고주 선정'}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          {awaitingPayment && winnerBid && isWinningAdvertiser ? (
            <TimeslotPaymentPanel
              slot={slot}
              bid={winnerBid}
              onPaid={() => {
                void load(true);
              }}
            />
          ) : null}
          {awaitingPayment && winnerBid && isOwner ? (
            <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-sm text-zinc-600">
              광고주 결제가 완료되면 제작·납품을 진행할 수 있습니다.
            </p>
          ) : null}
          {escrowed && winnerBid ? (
            <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
              <h2 className="text-lg font-bold text-zinc-950">납품 · 구매 확정</h2>
              <p className="mt-1 text-sm text-zinc-500">
                선정된 크리에이터가 결과물 링크를 제출하면, 광고주가 구매 확정한 뒤 정산이 이어집니다.
              </p>
              {delivered ? (
                <div className="mt-4 rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                  <p className="font-semibold">결과물 링크</p>
                  <a
                    href={slot.deliveryUrl || '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block break-all font-medium text-clink-accent hover:underline"
                  >
                    {slot.deliveryUrl}
                  </a>
                  {slot.deliveredAt ? (
                    <p className="mt-1 text-xs text-zinc-400">
                      납품 {formatDateTime(slot.deliveredAt)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {purchaseConfirmed ? (
                <p className="mt-4 rounded-xl bg-clink-peach px-4 py-3 text-sm font-semibold text-clink">
                  구매 확정 완료 · 정산이 생성되었습니다.
                  {slot.purchaseConfirmedAt
                    ? ` (${formatDateTime(slot.purchaseConfirmedAt)})`
                    : ''}
                </p>
              ) : isOwner && !delivered ? (
                <form
                  className="mt-4 flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitDelivery();
                  }}
                >
                  <label className="text-sm font-medium text-zinc-800" htmlFor="timeslot-delivery-url">
                    결과물 링크
                  </label>
                  <input
                    id="timeslot-delivery-url"
                    value={deliveryUrl}
                    onChange={(event) => setDeliveryUrl(event.target.value)}
                    placeholder="https://"
                    className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={fulfillBusy}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-clink px-4 text-sm font-semibold text-white hover:bg-stone-800 disabled:bg-zinc-300"
                  >
                    {fulfillBusy ? '납품 중...' : '제작 완료(납품)'}
                  </button>
                </form>
              ) : isOwner && delivered ? (
                <p className="mt-4 text-sm text-zinc-600">
                  광고주의 구매 확정을 기다리고 있습니다.
                </p>
              ) : isWinningAdvertiser && delivered ? (
                <button
                  type="button"
                  disabled={fulfillBusy}
                  onClick={() => {
                    void submitPurchaseConfirm();
                  }}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full bg-clink px-4 text-sm font-semibold text-white hover:bg-stone-800 disabled:bg-zinc-300"
                >
                  {fulfillBusy ? '확정 중...' : '구매 확정'}
                </button>
              ) : isWinningAdvertiser ? (
                <p className="mt-4 text-sm text-zinc-600">
                  크리에이터가 결과물을 납품하면 구매 확정할 수 있습니다.
                </p>
              ) : null}
            </section>
          ) : null}
          <ConfirmModal
            open={Boolean(pendingBid) && slotOpen}
            title="이 신청을 선정할까요?"
            description={`"${pendingBid?.advertiserName || '광고주'}"의 신청을 선정하면 나머지 신청은 미선정으로 마감됩니다. 선정된 광고주가 확정 금액 1건을 토스페이먼츠 에스크로로 결제한 뒤 거래가 진행됩니다.`}
            confirmLabel="광고주 선정"
            busyLabel="선정 중..."
            cancelLabel="취소"
            busy={Boolean(pendingBid && busyId === pendingBid.id)}
            onClose={() => {
              if (!busyId) {
                setPendingBid(null);
              }
            }}
            onConfirm={() => {
              if (!pendingBid || busyId) {
                return;
              }
              const selected = pendingBid;
              void awardBid(selected).finally(() => {
                setPendingBid(null);
              });
            }}
          />
        </div>
      )}
    </div>
  );
}
