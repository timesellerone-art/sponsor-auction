'use client';

import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { AdminCopyText } from '@/components/admin/AdminCopyText';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import {
  ADMIN_BID_STATUS_CLASS,
  ADMIN_BID_STATUS_LABEL,
  payoutLinkedToBid,
  resolveAdminBidStatus,
  type AdminBidLifecycle,
} from '@/lib/admin-bid-status';
import { downloadCsv, sortByAdminList, type AdminListSort } from '@/lib/admin-csv';
import { platformFeeFromAmount } from '@/lib/fees';
import { cn, formatAdminTimestamp, formatWon } from '@/lib/utils';
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
  const [sort, setSort] = useState<AdminListSort>('newest');

  const auctionById = useMemo(
    () =>
      new Map(
        (Array.isArray(auctions) ? auctions : []).map((auction) => [auction.id, auction]),
      ),
    [auctions],
  );
  const profileByKey = useMemo(() => {
    const map = new Map<string, ProfileItem>();
    for (const profile of profiles) {
      map.set(profile.id, profile);
      map.set(profile.name, profile);
    }
    return map;
  }, [profiles]);

  const filtered = useMemo(() => {
    if (!Array.isArray(bids)) {
      return [];
    }
    const keyword = query.trim().toLowerCase();
    const matched = bids.filter((bid) => {
      const auction = auctionById.get(bid.auctionId);
      const lifecycle = resolveAdminBidStatus(bid, auction, payouts);
      if (filter !== 'all' && lifecycle !== (filter as AdminBidLifecycle)) {
        return false;
      }
      const profile =
        (bid.creatorId ? profileByKey.get(bid.creatorId) : undefined) ||
        profileByKey.get(bid.creatorName || '');
      const payout = payouts.find((item) => payoutLinkedToBid(item, bid, auction));
      const email = (profile?.email || payout?.creatorEmail || '').toLowerCase();
      if (!keyword) {
        return true;
      }
      const name = (bid.creatorName || '').toLowerCase();
      const campaign = (auction?.title || '').toLowerCase();
      return name.includes(keyword) || email.includes(keyword) || campaign.includes(keyword);
    });

    return sortByAdminList(
      matched,
      sort,
      (bid) => {
        const auction = auctionById.get(bid.auctionId);
        const payout = payouts.find((item) => payoutLinkedToBid(item, bid, auction));
        return payout?.paidAt || payout?.requestedAt || bid.createdAt;
      },
      (bid) => bid.bidAmount,
    );
  }, [auctionById, bids, filter, payouts, profileByKey, query, sort]);

  const handleExport = () => {
    downloadCsv(
      `bids-${new Date().toISOString().slice(0, 10)}.csv`,
      ['크리에이터', '이메일', '계좌', '캠페인', '광고주', '상태', '입찰가', '처리일시'],
      filtered.map((bid) => {
        const auction = auctionById.get(bid.auctionId);
        const lifecycle = resolveAdminBidStatus(bid, auction, payouts);
        const payout = payouts.find((item) => payoutLinkedToBid(item, bid, auction));
        const profile =
          (bid.creatorId ? profileByKey.get(bid.creatorId) : undefined) ||
          profileByKey.get(bid.creatorName || '');
        return [
          bid.creatorName,
          profile?.email || payout?.creatorEmail || '',
          payout?.bankAccount || '',
          auction?.title || '',
          auction?.authorName || '',
          ADMIN_BID_STATUS_LABEL[lifecycle],
          bid.bidAmount,
          formatAdminTimestamp(payout?.paidAt || payout?.requestedAt || bid.createdAt),
        ];
      }),
    );
  };

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
        sort={sort}
        onSortChange={setSort}
        actions={
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-zinc-200 px-3 text-xs font-semibold whitespace-nowrap text-zinc-700 hover:bg-zinc-50"
          >
            <Download className="size-3.5" aria-hidden />
            엑셀/CSV 다운로드
          </button>
        }
      />
      {filtered.length === 0 ? (
        <div className="p-4">
          <AdminEmptyState message="조건에 맞는 입찰이 없습니다." />
        </div>
      ) : (
        <div className="max-h-[70vh] w-full min-w-0 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[800px] table-fixed text-left text-xs sm:text-sm lg:min-w-0">
            <colgroup>
              <col className="w-[16%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
              <col className="w-[12%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-2 py-2 sm:px-3 font-medium">크리에이터</th>
                <th className="px-2 py-2 sm:px-3 font-medium">캠페인</th>
                <th className="px-2 py-2 sm:px-3 font-medium">광고주</th>
                <th className="px-2 py-2 sm:px-3 font-medium">입찰 상태</th>
                <th className="px-2 py-2 sm:px-3 font-medium">처리 일시</th>
                <th className="px-2 py-2 sm:px-3 font-medium">입찰가</th>
                <th className="px-2 py-2 sm:px-3 font-medium">예상 수수료</th>
                <th className="px-2 py-2 sm:px-3 font-medium">채널</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bid) => {
                const auction = auctionById.get(bid.auctionId);
                const lifecycle = resolveAdminBidStatus(bid, auction, payouts);
                const campaign = auction?.title || '연결된 캠페인 없음';
                const advertiser = auction?.authorName || '미상';
                const payout = payouts.find((item) => payoutLinkedToBid(item, bid, auction));
                const profile =
                  (bid.creatorId ? profileByKey.get(bid.creatorId) : undefined) ||
                  profileByKey.get(bid.creatorName || '');
                const email = profile?.email || payout?.creatorEmail || '';
                const account = payout?.bankAccount || '';

                return (
                  <tr key={bid.id} className="border-b border-zinc-100 last:border-0">
                    <td className="min-w-0 max-w-[220px] overflow-hidden px-2 py-2 sm:px-3 align-top">
                      <p
                        className="min-w-0 overflow-hidden font-medium text-ellipsis whitespace-nowrap text-zinc-950"
                        title={bid.creatorName || '이름 없음'}
                      >
                        {bid.creatorName || '이름 없음'}
                      </p>
                      <AdminCopyText value={email} emptyLabel="이메일 없음" className="mt-1" />
                      <AdminCopyText value={account} emptyLabel="계좌 미등록" className="mt-0.5" />
                    </td>
                    <td className="min-w-0 max-w-[300px] overflow-hidden px-2 py-2 sm:px-3 align-top text-zinc-600 text-ellipsis whitespace-nowrap">
                      <span className="block min-w-0 truncate" title={campaign}>
                        {campaign}
                      </span>
                    </td>
                    <td className="min-w-0 max-w-[200px] overflow-hidden px-2 py-2 sm:px-3 align-top text-zinc-600 text-ellipsis whitespace-nowrap">
                      <span className="block min-w-0 truncate" title={advertiser}>
                        {advertiser}
                      </span>
                    </td>
                    <td className="min-w-0 px-2 py-2 sm:px-3 align-top">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
                          ADMIN_BID_STATUS_CLASS[lifecycle],
                        )}
                      >
                        {ADMIN_BID_STATUS_LABEL[lifecycle]}
                      </span>
                    </td>
                    <td className="min-w-0 px-2 py-2 sm:px-3 align-top whitespace-nowrap text-zinc-600">
                      {formatAdminTimestamp(payout?.paidAt || payout?.requestedAt || bid.createdAt)}
                    </td>
                    <td className="min-w-0 px-2 py-2 sm:px-3 align-top font-medium whitespace-nowrap text-zinc-950">
                      {formatWon(bid.bidAmount)}
                    </td>
                    <td className="min-w-0 px-2 py-2 sm:px-3 align-top whitespace-nowrap text-zinc-600">
                      {formatWon(platformFeeFromAmount(bid.bidAmount))}
                    </td>
                    <td className="min-w-0 max-w-[200px] overflow-hidden px-2 py-2 sm:px-3 align-top">
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
