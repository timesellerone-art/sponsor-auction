'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AuctionCardSkeleton } from '@/components/AuctionCard';
import { CreateTimeslotModal } from '@/components/CreateTimeslotModal';
import { PageContainer } from '@/components/PageContainer';
import { useAuth } from '@/components/AuthProvider';
import { SettlementAccountSummary } from '@/components/SettlementAccountSummary';
import { FeeBreakdownCard } from '@/components/fee/FeeBreakdownCard';
import { authRequestInit } from '@/lib/auth-request';
import { getCreatorDashboard } from '@/lib/dashboard';
import { addBusinessDays, formatSeoulDateLabel } from '@/lib/business-days';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import {
  parseSettlementType,
  settlementAccountError,
  settlementAccountFromParts,
  type SettlementType,
} from '@/lib/settlement-account';
import { dealDetailHref } from '@/lib/timeslot-deal';
import { auctionStatusLabel, creatorPayoutStatusLabel } from '@/lib/status-labels';
import { cn, formatDateTime, formatWon } from '@/lib/utils';
import type { TimeSlotItem } from '@/types/timeslot';
import { isBidSelected } from '@/types/auction';
import type { CreatorDeal } from '@/types/dashboard';

export function CreatorDashboard() {
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const userRef = useRef(user);
  const [deals, setDeals] = useState<CreatorDeal[]>([]);
  const [slots, setSlots] = useState<TimeSlotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createSlotOpen, setCreateSlotOpen] = useState(false);
  const [settlementType, setSettlementType] = useState<SettlementType>('individual');
  const [settlementBankName, setSettlementBankName] = useState('');
  const [settlementAccountNumber, setSettlementAccountNumber] = useState('');
  const [accountMissing, setAccountMissing] = useState(false);

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
        const [result, slotResponse, settlementResponse] = await Promise.all([
          getCreatorDashboard(actor),
          fetch('/api/timeslots?mine=1', await authRequestInit({ cache: 'no-store' })).catch(
            () => null,
          ),
          fetch('/api/account/settlement', await authRequestInit({ cache: 'no-store' })).catch(
            () => null,
          ),
        ]);
        const slotBody = slotResponse
          ? ((await slotResponse.json().catch(() => null)) as {
              data?: TimeSlotItem[];
              error?: string;
            } | null)
          : null;
        const slotRows = Array.isArray(slotBody?.data) ? slotBody.data : [];
        const settlementBody = settlementResponse
          ? ((await settlementResponse.json().catch(() => null)) as {
              settlementType?: string;
              bankName?: string;
              accountNumber?: string;
              accountHolder?: string;
            } | null)
          : null;
        if (cancelled) {
          return;
        }
        const account = settlementAccountFromParts({
          bankName: settlementBody?.bankName,
          accountNumber: settlementBody?.accountNumber,
          accountHolder: settlementBody?.accountHolder,
        });
        setSettlementType(parseSettlementType(settlementBody?.settlementType));
        setSettlementBankName(account.bankName);
        setSettlementAccountNumber(account.accountNumber);
        setAccountMissing(Boolean(settlementAccountError(account)));
        const list = Array.isArray(result.data) ? result.data : [];
        setDeals(list);
        setSlots(slotRows);
        setError(
          list.length === 0 && slotRows.length === 0
            ? '제출한 제안이 없습니다.'
            : result.error,
        );
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

    void load(false);
    const onChanged = () => {
      void load(true);
    };
    window.addEventListener('auctions:changed', onChanged);
    window.addEventListener('payouts:changed', onChanged);
    window.addEventListener('timeslots:changed', onChanged);
    window.addEventListener('settlement:changed', onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('auctions:changed', onChanged);
      window.removeEventListener('payouts:changed', onChanged);
      window.removeEventListener('timeslots:changed', onChanged);
      window.removeEventListener('settlement:changed', onChanged);
    };
  }, [userId]);

  const awardedDeals = deals.filter(
    (deal) =>
      deal.bid.status === 'selected' ||
      Boolean(deal.auction && isBidSelected(deal.bid, deal.auction.winnerBidId)),
  );
  const paidDeals = awardedDeals.filter((deal) => deal.payoutStatus === 'paid');
  const holdDeals = awardedDeals.filter((deal) => deal.payoutStatus === 'hold');
  const settlingDeals = awardedDeals.filter(
    (deal) => deal.payoutStatus !== 'paid' && deal.payoutStatus !== 'hold',
  );
  const pendingDeals = deals.filter((deal) => !awardedDeals.includes(deal));

  return (
    <PageContainer className="flex min-w-0 flex-1 flex-col pt-4 pb-6 sm:pt-5 sm:pb-10">
      <p className="text-sm font-semibold tracking-wide text-clink-accent">크리에이터</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">내 제안</h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        제출한 제안과 낙찰 건의 정산 예정·지급 완료 상태, 정산 금액과 계좌·세무 정보를 확인할 수
        있습니다.
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setCreateSlotOpen(true)}
          className="inline-flex h-10 items-center rounded-full bg-clink px-4 text-sm font-semibold text-white hover:bg-stone-800"
        >
          크리에이터 상품 등록
        </button>
      </div>
      <SettlementAccountSummary
        settlementType={settlementType}
        bankName={settlementBankName}
        accountNumber={settlementAccountNumber}
        missing={accountMissing}
      />

      <section className="mt-8">
        <h2 className="text-lg font-bold text-zinc-950">내 크리에이터 상품</h2>
        {slots.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">등록한 크리에이터 상품이 없습니다.</p>
        ) : (
          <ul className="mt-4 flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-1">
            {slots.map((slot) => (
              <li key={slot.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/timeslots/${slot.id}`} className="font-semibold hover:underline">
                      {slot.title}
                    </Link>
                    <p className="mt-1 text-sm text-zinc-500">
                      최고가 {slot.currentHighestBid > 0 ? formatWon(slot.currentHighestBid) : '없음'} · 제안{' '}
                      {slot.bidsCount}
                    </p>
                  </div>
                  {slot.status === 'open' ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const response = await fetch(
                          `/api/timeslots/${encodeURIComponent(slot.id)}`,
                          await authRequestInit({
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'closed' }),
                          }),
                        );
                        if (!response.ok) {
                          return;
                        }
                        window.dispatchEvent(new Event('timeslots:changed'));
                      }}
                      className="text-xs font-semibold text-zinc-600 hover:underline"
                    >
                      마감
                    </button>
                  ) : (
                    <span
                      className={
                        slot.status === 'awarded'
                          ? 'rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800'
                          : 'text-xs text-zinc-400'
                      }
                    >
                      {slot.status === 'awarded'
                        ? creatorPayoutStatusLabel(
                            deals.find(
                              (deal) =>
                                deal.kind === 'timeslot' && deal.auction?.id === slot.id,
                            )?.payoutStatus,
                            true,
                          )
                        : '마감'}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-clink px-4 text-sm font-semibold text-white hover:bg-stone-800"
          >
            오픈 캠페인 둘러보기
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-5">
          <DealSection
            title="지급 완료"
            count={paidDeals.length}
            emptyText="지급 완료 0건"
            countClassName="bg-clink-peach text-clink-accent"
          >
            {paidDeals.map((deal) => (
              <DealCard key={`paid-${deal.bid.id}`} deal={deal} highlight taxKind={settlementType} />
            ))}
          </DealSection>

          <DealSection
            title="정산 보류"
            count={holdDeals.length}
            emptyText="정산 보류 0건"
            countClassName="bg-rose-50 text-rose-700"
          >
            {holdDeals.map((deal) => (
              <DealCard key={`hold-${deal.bid.id}`} deal={deal} highlight taxKind={settlementType} />
            ))}
          </DealSection>

          <DealSection
            title="낙찰·정산 예정"
            count={settlingDeals.length}
            emptyText="낙찰·정산 예정 0건"
            countClassName="bg-amber-50 text-amber-800"
          >
            {settlingDeals.map((deal) => (
              <DealCard key={`settling-${deal.bid.id}`} deal={deal} highlight taxKind={settlementType} />
            ))}
          </DealSection>

          <DealSection
            title="진행 중인 제안"
            count={pendingDeals.length}
            emptyText="진행 중인 제안 0건"
            countClassName="bg-stone-100 text-stone-600"
          >
            {pendingDeals.map((deal) => (
              <DealCard key={`pending-${deal.bid.id}`} deal={deal} taxKind={settlementType} />
            ))}
          </DealSection>
        </div>
      )}
      <CreateTimeslotModal open={createSlotOpen} onClose={() => setCreateSlotOpen(false)} />
    </PageContainer>
  );
}

function DealSection({
  title,
  count,
  emptyText,
  countClassName,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  countClassName: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-zinc-950">{title}</h2>
        <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', countClassName)}>
          {count}건
        </span>
      </div>
      {count === 0 ? (
        <p className="mt-1.5 text-sm text-zinc-400">{emptyText}</p>
      ) : (
        <ul className="mt-2 flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">{children}</ul>
      )}
    </section>
  );
}

function DealCard({
  deal,
  highlight = false,
  taxKind = 'individual',
}: {
  deal: CreatorDeal;
  highlight?: boolean;
  taxKind?: SettlementType;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const awarded = deal.bid.status === 'selected';
  const payoutPaid = deal.payoutStatus === 'paid';
  const payoutHold = deal.payoutStatus === 'hold';
  const resolvedTaxKind =
    deal.payout?.taxKind === 'business' || taxKind === 'business' ? 'business' : taxKind;
  const href = deal.auction?.id ? dealDetailHref(deal.kind, deal.auction.id) : '/';
  const amounts = describeSettlementAmounts(deal.bid.bidAmount, resolvedTaxKind);
  const dueAt =
    deal.payout?.settlementDueAt ||
    (deal.payout?.requestedAt ? addBusinessDays(deal.payout.requestedAt, 4) : null) ||
    (deal.payment?.confirmedAt ? addBusinessDays(deal.payment.confirmedAt, 4) : null);
  const dateLabel =
    payoutPaid && deal.payout?.paidAt
      ? `지급 ${formatDateTime(deal.payout.paidAt)}`
      : dueAt
        ? `정산 예정 ${formatSeoulDateLabel(dueAt)}`
        : null;

  return (
    <li
      className={cn(
        'rounded-xl border bg-white px-3.5 py-3',
        highlight || awarded ? 'border-clink-peach-strong' : 'border-zinc-200',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={href}
          title={deal.auction?.title || '연결된 캠페인 없음'}
          className="min-w-0 truncate font-semibold text-zinc-950 hover:underline"
        >
          {deal.auction?.title || '연결된 캠페인 없음'}
        </Link>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold',
            payoutPaid
              ? 'bg-clink-peach text-clink'
              : payoutHold
                ? 'bg-rose-50 text-rose-700'
                : awarded
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-stone-100 text-stone-600',
          )}
        >
          {creatorPayoutStatusLabel(deal.payoutStatus, awarded)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-zinc-600">
        <span>제안 {formatWon(deal.bid.bidAmount)}</span>
        {awarded ? <span>실지급액 {formatWon(amounts.transferAmount)}</span> : null}
        {deal.kind === 'timeslot' && awarded && !deal.fulfillment?.deliveredAt && !deal.fulfillment?.deliveryUrl ? (
          <span>납품 필요</span>
        ) : null}
        {deal.kind === 'timeslot' && awarded && (deal.fulfillment?.deliveredAt || deal.fulfillment?.deliveryUrl) && !deal.fulfillment?.purchaseConfirmedAt ? (
          <span>구매 확정 대기</span>
        ) : null}
        {deal.kind === 'timeslot' && deal.fulfillment?.purchaseConfirmedAt ? <span>구매 확정</span> : null}
        {dateLabel ? <span>{dateLabel}</span> : null}
        <button
          type="button"
          className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((open) => !open)}
        >
          {detailsOpen ? '상세 접기' : '상세 보기'}
        </button>
      </div>
      {detailsOpen ? (
        <div className="mt-2 space-y-2 border-t border-zinc-100 pt-2">
          {awarded ? (
            <FeeBreakdownCard role="creator" amount={deal.bid.bidAmount} taxKind={resolvedTaxKind} />
          ) : null}
          {deal.bid.proposalText ? (
            <p className="text-sm leading-6 text-zinc-600">{deal.bid.proposalText}</p>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            {deal.auction?.status ? (
              <span>
                {deal.kind === 'timeslot' ? '상품' : '캠페인'} {auctionStatusLabel(deal.auction.status)}
              </span>
            ) : null}
            <span>제출 {formatDateTime(deal.bid.createdAt)}</span>
            {deal.payment?.orderId ? <span>주문 {deal.payment.orderId}</span> : null}
          </div>
        </div>
      ) : null}
    </li>
  );
}
