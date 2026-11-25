'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast } from '@/components/Toast';
import { CreatorRatingBadge } from '@/components/CreatorRatingBadge';
import { ADVERTISER_FEE_PERCENT, VAT_PERCENT } from '@/lib/fee-policy';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import { formatDateTime, formatWon } from '@/lib/utils';
import { ACCESS_REASON } from '@/lib/access';
import { getAwardBlockReason } from '@/lib/validation';
import { BID_STATUS_LABEL } from '@/lib/status-labels';
import {
  isAuctionClosed,
  isBidSelected,
  type AuctionItem,
  type BidItem,
} from '@/types/auction';

type BidProposalListProps = {
  auction: AuctionItem;
  bids: BidItem[];
  loading: boolean;
  error: string | null;
  busyId: string | null;
  allowAward: boolean;
  onAward: (bid: BidItem) => void | Promise<void>;
};

export function BidProposalList({
  auction,
  bids,
  loading,
  error,
  busyId,
  allowAward,
  onAward,
}: BidProposalListProps) {
  const [pendingBid, setPendingBid] = useState<BidItem | null>(null);
  const closed = isAuctionClosed(auction.status) || Boolean(auction.winnerBidId);
  const canAward =
    allowAward &&
    auction.status === 'active' &&
    !auction.isBlind &&
    !auction.winnerBidId;
  const safeBids = Array.isArray(bids) ? [...bids] : [];
  const leadingAmount =
    auction.leadingBidAmount && auction.leadingBidAmount > 0
      ? auction.leadingBidAmount
      : Math.min(...safeBids.map((item) => item.bidAmount), Number.POSITIVE_INFINITY);
  const highestAmount =
    auction.highestBidAmount && auction.highestBidAmount > 0
      ? auction.highestBidAmount
      : Math.max(...safeBids.map((item) => item.bidAmount), 0);
  const selectedBid =
    safeBids.find((bid) => isBidSelected(bid, auction.winnerBidId)) ?? null;

  const holdQuote = pendingBid ? describeSettlementAmounts(pendingBid.bidAmount) : null;

  return (
    <section
      id="proposals"
      className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-clink-accent">
            광고주 확인
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950">
            제출된 크리에이터 제안 목록
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            채널, 평판 점수, 제안 금액, 제안 메시지를 비교한 뒤 낙찰할 수 있습니다.
          </p>
          {safeBids.length > 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              최저 제안 {Number.isFinite(leadingAmount) ? formatWon(leadingAmount) : '-'}
              {' · '}
              최고 제안가 {highestAmount > 0 ? formatWon(highestAmount) : '-'}
            </p>
          ) : null}
        </div>
        {closed || Boolean(selectedBid) ? (
          <span className="rounded-full bg-clink-peach px-2.5 py-1 text-xs font-semibold text-clink-accent">
            {isAuctionClosed(auction.status) || selectedBid
              ? '낙찰된 캠페인입니다'
              : '매칭 완료된 캠페인입니다'}
          </span>
        ) : null}
      </div>

      {closed && selectedBid ? (
        <div className="mt-4 rounded-xl border border-clink-peach-strong bg-clink-peach px-4 py-3 text-sm text-clink">
          <p className="font-semibold">선택된 크리에이터</p>
          <p className="mt-1">
            {selectedBid.creatorName || '이름 없음'} · {formatWon(selectedBid.bidAmount)}
          </p>
          {selectedBid.creatorChannelUrl ? (
            <a
              href={selectedBid.creatorChannelUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block truncate text-xs font-medium text-clink-accent hover:underline"
            >
              {selectedBid.creatorChannelUrl}
            </a>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="mt-4 space-y-3">
          <div className="h-28 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-28 animate-pulse rounded-xl bg-zinc-100" />
        </div>
      ) : safeBids.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-10 text-center">
          <p className="text-sm font-medium text-zinc-800">아직 들어온 제안이 없습니다</p>
          {error ? <p className="mt-1 text-xs text-zinc-500">{error}</p> : null}
        </div>
      ) : (
        <ul className="mt-4 flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
          {safeBids.map((bid) => {
            const winner = isBidSelected(bid, auction.winnerBidId);
            const busy = busyId === bid.id;

            return (
              <li
                key={bid.id}
                className="relative min-w-0 rounded-xl border border-zinc-200 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-950">
                      {bid.creatorName || '이름 없음'}
                    </p>
                    <CreatorRatingBadge
                      className="mt-1"
                      rating={bid.creatorRating}
                      completionRate={bid.creatorCompletionRate}
                    />
                    {bid.creatorChannelUrl ? (
                      <a
                        href={bid.creatorChannelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-clink-accent hover:underline"
                      >
                        <span className="truncate">{bid.creatorChannelUrl}</span>
                        <ExternalLink className="size-3 shrink-0" aria-hidden />
                      </a>
                    ) : (
                      <p className="mt-1 text-xs text-zinc-400">채널 정보 없음</p>
                    )}
                  </div>
                  {canAward ? (
                    <button
                      type="button"
                      disabled={busy || Boolean(busyId)}
                      onClick={() => {
                        const blocked = getAwardBlockReason(auction);
                        if (blocked) {
                          showToast(blocked);
                          return;
                        }
                        setPendingBid(bid);
                      }}
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-clink px-3 text-xs font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-zinc-300 sm:text-sm"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : null}
                      {busy ? '낙찰 중...' : '낙찰하기 (선택)'}
                    </button>
                  ) : winner ? (
                    <span className="shrink-0 rounded-full bg-clink-peach px-3 py-1 text-xs font-semibold text-clink-accent">
                      {BID_STATUS_LABEL.selected}
                    </span>
                  ) : closed ? (
                    <span className="shrink-0 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                      미선정
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-lg font-bold tracking-tight text-zinc-950">
                  {formatWon(bid.bidAmount)}
                  {bid.bidAmount === leadingAmount ? (
                    <span className="ml-2 text-xs font-semibold text-clink-accent">최저 제안</span>
                  ) : null}
                  {bid.bidAmount === highestAmount && highestAmount !== leadingAmount ? (
                    <span className="ml-2 text-xs font-semibold text-amber-700">최고 제안가</span>
                  ) : null}
                </p>
                <p className="mt-2 text-sm leading-6 whitespace-pre-wrap text-zinc-600">
                  {bid.proposalText || '제안 내용 없음'}
                </p>
                <p className="mt-3 text-xs text-zinc-400">
                  제출 일자 {formatDateTime(bid.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmModal
        open={Boolean(pendingBid) && !closed}
        title="이 제안을 낙찰할까요?"
        description={`"${pendingBid?.creatorName || '크리에이터'}"의 제안을 선택하면 보유 크레딧에서 공급가액과 부가세가 즉시 예치 차감됩니다. 잔액이 부족하면 충전 후 다시 낙찰할 수 있습니다.`}
        confirmLabel="크레딧으로 낙찰하기"
        busyLabel="낙찰 중..."
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
          if (!allowAward) {
            showToast(ACCESS_REASON['award-auth']);
            setPendingBid(null);
            return;
          }
          const selected = pendingBid;
          void Promise.resolve(onAward(selected)).finally(() => {
            setPendingBid(null);
          });
        }}
      >
        {holdQuote ? (
          <dl className="mt-3 space-y-1.5 rounded-xl bg-zinc-50 px-3 py-3 text-sm text-zinc-700">
            <div className="flex items-center justify-between gap-3">
              <dt>낙찰 금액</dt>
              <dd className="font-medium tabular-nums text-zinc-950">
                {formatWon(holdQuote.bidAmount)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>공급가액 (낙찰 + 수수료 {ADVERTISER_FEE_PERCENT}%)</dt>
              <dd className="font-medium tabular-nums text-zinc-950">
                {formatWon(holdQuote.advertiserSupply)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>부가세 ({VAT_PERCENT}% 별도)</dt>
              <dd className="font-medium tabular-nums text-zinc-950">
                {formatWon(holdQuote.advertiserVat)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 font-semibold text-zinc-950">
              <dt>총 차감액</dt>
              <dd className="tabular-nums">{formatWon(holdQuote.advertiserCharge)}</dd>
            </div>
          </dl>
        ) : null}
      </ConfirmModal>
    </section>
  );
}
