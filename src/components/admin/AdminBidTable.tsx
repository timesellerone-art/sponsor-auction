'use client';

import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { platformFeeFromAmount } from '@/lib/fees';
import { formatWon } from '@/lib/utils';
import type { AuctionItem, BidItem } from '@/types/auction';

type AdminBidTableProps = {
  bids: BidItem[];
  auctions: AuctionItem[];
};

export function AdminBidTable({ bids, auctions }: AdminBidTableProps) {
  if (!Array.isArray(bids) || bids.length === 0) {
    return <AdminEmptyState />;
  }

  const titleById = new Map(
    (Array.isArray(auctions) ? auctions : []).map((auction) => [
      auction.id,
      auction.title || '제목 없음',
    ]),
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
      <table className="min-w-[760px] w-full text-left text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">크리에이터</th>
            <th className="px-4 py-3 font-medium">캠페인</th>
            <th className="px-4 py-3 font-medium">입찰가</th>
            <th className="px-4 py-3 font-medium">예상 수수료</th>
            <th className="px-4 py-3 font-medium">채널</th>
          </tr>
        </thead>
        <tbody>
          {bids.map((bid) => (
            <tr key={bid.id} className="border-b border-zinc-100 last:border-0">
              <td className="px-4 py-3">
                <p className="font-medium text-zinc-950">
                  {bid.creatorName || '이름 없음'}
                </p>
                <p className="mt-1 line-clamp-1 text-xs text-zinc-500">
                  {bid.proposalText || '제안 내용 없음'}
                </p>
              </td>
              <td className="px-4 py-3 text-zinc-600">
                {titleById.get(bid.auctionId) || '연결된 캠페인 없음'}
              </td>
              <td className="px-4 py-3 font-medium text-zinc-950">
                {formatWon(bid.bidAmount)}
              </td>
              <td className="px-4 py-3 text-zinc-600">
                {formatWon(platformFeeFromAmount(bid.bidAmount))}
              </td>
              <td className="max-w-[180px] px-4 py-3">
                {bid.creatorChannelUrl ? (
                  <a
                    href={bid.creatorChannelUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-teal-800 hover:underline"
                  >
                    {bid.creatorChannelUrl}
                  </a>
                ) : (
                  <span className="text-zinc-400">URL 없음</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
