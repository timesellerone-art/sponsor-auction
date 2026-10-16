'use client';

import { useEffect, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast } from '@/components/Toast';
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
  const safeBids = Array.isArray(bids) ? bids : [];
  const selectedBid =
    safeBids.find((bid) => isBidSelected(bid, auction.winnerBidId)) ?? null;

  useEffect(() => {
    if (closed) {
      setPendingBid(null);
    }
  }, [closed]);

  return (
    <section
      id="proposals"
      className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            광고주 확인
          </p>
          <h2 className="mt-1 text-lg font-bold text-zinc-950">
            제출된 크리에이터 제안 목록
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            채널, 제안 금액, 제안 메시지, 제출 일자를 비교한 뒤 낙찰할 수 있습니다.
          </p>
        </div>
        {closed ? (
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-800">
            {auction.status === 'completed'
              ? '결제 완료된 역경매입니다'
              : '매칭 완료된 역경매입니다'}
          </span>
        ) : null}
      </div>

      {closed && selectedBid ? (
        <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          <p className="font-semibold">선택된 크리에이터</p>
          <p className="mt-1">
            {selectedBid.creatorName || '이름 없음'} · {formatWon(selectedBid.bidAmount)}
          </p>
          {selectedBid.creatorChannelUrl ? (
            <a
              href={selectedBid.creatorChannelUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block truncate text-xs font-medium text-teal-800 hover:underline"
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
                    {bid.creatorChannelUrl ? (
                      <a
                        href={bid.creatorChannelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-teal-800 hover:underline"
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
                      className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-full bg-teal-700 px-3 text-xs font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 sm:text-sm"
                    >
                      {busy ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : null}
                      {busy ? '낙찰 중...' : '낙찰하기 (선택)'}
                    </button>
                  ) : winner ? (
                    <span className="shrink-0 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">
                      {auction.status === 'completed'
                        ? BID_STATUS_LABEL.selected
                        : '낙찰됨'}
                    </span>
                  ) : null}
                </div>

                <p className="mt-3 text-lg font-bold tracking-tight text-zinc-950">
                  {formatWon(bid.bidAmount)}
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
        open={Boolean(pendingBid)}
        title="이 제안을 낙찰할까요?"
        description={`"${pendingBid?.creatorName || '크리에이터'}"의 제안을 선택하면 안전결제를 진행합니다. 결제가 완료된 뒤에만 역경매가 마감됩니다.`}
        confirmLabel="결제하고 낙찰하기"
        busyLabel="결제 준비 중..."
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
          const blocked = getAwardBlockReason(auction);
          if (blocked) {
            showToast(blocked);
            setPendingBid(null);
            return;
          }
          const selected = pendingBid;
          setPendingBid(null);
          void onAward(selected);
        }}
      />
    </section>
  );
}
