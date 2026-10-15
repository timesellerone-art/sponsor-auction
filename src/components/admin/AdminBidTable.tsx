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
    <div className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white">
      <div className="w-full min-w-0 overflow-x-auto">
      <table className="w-full min-w-[760px] table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-1/3" />
          <col className="w-[12%]" />
          <col className="w-[13%]" />
          <col className="w-[20%]" />
        </colgroup>
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
              <td className="min-w-0 max-w-[220px] overflow-hidden px-4 py-3 align-top">
                <p
                  className="min-w-0 overflow-hidden font-medium text-ellipsis whitespace-nowrap text-zinc-950"
                  title={bid.creatorName || '이름 없음'}
                >
                  {bid.creatorName || '이름 없음'}
                </p>
                <p
                  className="mt-1 min-w-0 overflow-hidden text-xs text-ellipsis whitespace-nowrap text-zinc-500"
                  title={bid.proposalText || '제안 내용 없음'}
                >
                  {bid.proposalText || '제안 내용 없음'}
                </p>
              </td>
              <td className="min-w-0 max-w-[300px] overflow-hidden px-4 py-3 align-top text-zinc-600 text-ellipsis whitespace-nowrap">
                <span
                  className="block min-w-0 truncate"
                  title={titleById.get(bid.auctionId) || '연결된 캠페인 없음'}
                >
                  {titleById.get(bid.auctionId) || '연결된 캠페인 없음'}
                </span>
              </td>
              <td className="min-w-0 px-4 py-3 align-top font-medium whitespace-nowrap text-zinc-950">
                {formatWon(bid.bidAmount)}
              </td>
              <td className="min-w-0 px-4 py-3 align-top whitespace-nowrap text-zinc-600">
                {formatWon(platformFeeFromAmount(bid.bidAmount))}
              </td>
              <td className="min-w-0 max-w-[200px] overflow-hidden px-4 py-3 align-top">
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
    </div>
  );
}
