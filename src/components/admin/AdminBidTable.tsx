'use client';

import { useMemo, useState } from 'react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import {
  ADMIN_BID_STATUS_CLASS,
  ADMIN_BID_STATUS_LABEL,
  resolveAdminBidStatus,
  type AdminBidLifecycle,
} from '@/lib/admin-bid-status';
import { platformFeeFromAmount } from '@/lib/fees';
import { cn, formatWon } from '@/lib/utils';
import type { BidAdminFilter, PayoutItem, ProfileItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';

const FILTERS: { id: BidAdminFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '제안/대기' },
  { id: 'awarded', label: '낙찰/결제완료' },
  { id: 'paid', label: '지급 완료' },
  { id: 'rejected', label: '탈락/취소' },
];

type AdminBidTableProps = {
  bids: BidItem[];
  auctions: AuctionItem[];
  payouts?: PayoutItem[];
  profiles?: ProfileItem[];
};

export function AdminBidTable({
  bids,
  auctions,
  payouts = [],
  profiles = [],
}: AdminBidTableProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BidAdminFilter>('all');

  const auctionById = useMemo(
    () =>
      new Map(
        (Array.isArray(auctions) ? auctions : []).map((auction) => [auction.id, auction]),
      ),
    [auctions],
  );
  const emailByCreator = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of profiles) {
      map.set(profile.id, (profile.email || '').toLowerCase());
      map.set(profile.name, (profile.email || '').toLowerCase());
    }
    return map;
  }, [profiles]);

  const filtered = useMemo(() => {
    if (!Array.isArray(bids)) {
      return [];
    }
    const keyword = query.trim().toLowerCase();
    return bids.filter((bid) => {
      const auction = auctionById.get(bid.auctionId);
      const lifecycle = resolveAdminBidStatus(bid, auction, payouts);
      if (filter !== 'all' && lifecycle !== (filter as AdminBidLifecycle)) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const name = (bid.creatorName || '').toLowerCase();
      const campaign = (auction?.title || '').toLowerCase();
      const email =
        (bid.creatorId ? emailByCreator.get(bid.creatorId) : '') ||
        emailByCreator.get(bid.creatorName || '') ||
        '';
      return name.includes(keyword) || email.includes(keyword) || campaign.includes(keyword);
    });
  }, [auctionById, bids, emailByCreator, filter, payouts, query]);

  if (!Array.isArray(bids) || bids.length === 0) {
    return <AdminEmptyState />;
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white">
      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="크리에이터 이름, 이메일, 캠페인 제목 검색"
        searchLabel="입찰 검색"
        filters={FILTERS}
        filter={filter}
        onFilterChange={setFilter}
      />
      {filtered.length === 0 ? (
        <div className="p-4">
          <AdminEmptyState message="조건에 맞는 입찰이 없습니다." />
        </div>
      ) : (
        <div className="max-h-[70vh] w-full min-w-0 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[960px] table-fixed text-left text-sm">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[18%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">크리에이터</th>
                <th className="px-4 py-3 font-medium">캠페인</th>
                <th className="px-4 py-3 font-medium">광고주</th>
                <th className="px-4 py-3 font-medium">입찰 상태</th>
                <th className="px-4 py-3 font-medium">입찰가</th>
                <th className="px-4 py-3 font-medium">예상 수수료</th>
                <th className="px-4 py-3 font-medium">채널</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bid) => {
                const auction = auctionById.get(bid.auctionId);
                const lifecycle = resolveAdminBidStatus(bid, auction, payouts);
                const campaign = auction?.title || '연결된 캠페인 없음';
                const advertiser = auction?.authorName || '미상';

                return (
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
                      <span className="block min-w-0 truncate" title={campaign}>
                        {campaign}
                      </span>
                    </td>
                    <td className="min-w-0 max-w-[200px] overflow-hidden px-4 py-3 align-top text-zinc-600 text-ellipsis whitespace-nowrap">
                      <span className="block min-w-0 truncate" title={advertiser}>
                        {advertiser}
                      </span>
                    </td>
                    <td className="min-w-0 px-4 py-3 align-top">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
                          ADMIN_BID_STATUS_CLASS[lifecycle],
                        )}
                      >
                        {ADMIN_BID_STATUS_LABEL[lifecycle]}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
