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
import { DELETED_CAMPAIGN_LABEL } from '@/lib/admin-integrity';
import { creatorCombinedFeeAmount, floorToTenWon, platformNetFeeFromBid } from '@/lib/fees';
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

function bidView(
  bid: BidItem,
  auctionById: Map<string, AuctionItem>,
  payouts: PayoutItem[],
  profileByKey: Map<string, ProfileItem>,
) {
  const auction = auctionById.get(bid.auctionId);
  const lifecycle = resolveAdminBidStatus(bid, auction, payouts);
  const payout = payouts.find((item) => payoutLinkedToBid(item, bid, auction));
  const profile =
    (bid.creatorId ? profileByKey.get(bid.creatorId) : undefined) ||
    profileByKey.get(bid.creatorName || '');
  return {
    lifecycle,
    campaign: auction?.title || DELETED_CAMPAIGN_LABEL,
    advertiser: auction?.authorName || '미상',
    email: profile?.email || payout?.creatorEmail || '',
    account: payout?.bankAccount || '',
    creatorFee: floorToTenWon(creatorCombinedFeeAmount(bid.bidAmount)),
    platformNet: platformNetFeeFromBid(bid.bidAmount),
    processedAt: formatAdminTimestamp(payout?.paidAt || payout?.requestedAt || bid.createdAt),
  };
}

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
      ['크리에이터', '이메일', '계좌', '캠페인', '광고주', '상태', '제안가', '처리일시'],
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
          auction?.title || DELETED_CAMPAIGN_LABEL,
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
        searchLabel="제안 검색"
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
          <AdminEmptyState message="조건에 맞는 제안이 없습니다." />
        </div>
      ) : (
        <>
        <ul className="flex flex-col gap-3 p-3 pb-24 md:hidden">
          {filtered.map((bid) => {
            const row = bidView(bid, auctionById, payouts, profileByKey);
            return (
              <li key={bid.id} className="rounded-2xl border border-zinc-200 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold leading-5 text-zinc-950">
                      {bid.creatorName || '이름 없음'}
                    </p>
                    <AdminCopyText
                      value={row.email}
                      emptyLabel="이메일 없음"
                      className="mt-1 whitespace-normal break-all"
                    />
                    <AdminCopyText
                      value={row.account}
                      emptyLabel="계좌 미등록"
                      className="mt-0.5 whitespace-normal break-all"
                    />
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold',
                      ADMIN_BID_STATUS_CLASS[row.lifecycle],
                    )}
                  >
                    {ADMIN_BID_STATUS_LABEL[row.lifecycle]}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm text-zinc-700">{row.campaign}</p>
                <p className="mt-1 break-words text-xs text-zinc-500">광고주 {row.advertiser}</p>
                <dl className="mt-3 space-y-2 border-t border-zinc-100 pt-3 text-sm">
                  <div className="min-w-0">
                    <dt className="text-[11px] font-medium text-zinc-500">처리 일시</dt>
                    <dd className="mt-0.5 break-words tabular-nums text-zinc-800">{row.processedAt}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-medium text-zinc-500">제안가</dt>
                    <dd className="mt-0.5 break-all font-medium tabular-nums text-zinc-950">
                      {formatWon(bid.bidAmount)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-medium text-zinc-500">예상 수수료</dt>
                    <dd className="mt-0.5 break-all tabular-nums text-zinc-800">
                      {formatWon(row.platformNet)}
                    </dd>
                    <dd className="mt-0.5 break-all text-xs tabular-nums text-zinc-500">
                      공제 {formatWon(row.creatorFee)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-medium text-zinc-500">채널</dt>
                    <dd className="mt-0.5 break-all">
                      {bid.creatorChannelUrl ? (
                        <a
                          href={bid.creatorChannelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-clink-accent hover:underline"
                        >
                          {bid.creatorChannelUrl}
                        </a>
                      ) : (
                        <span className="text-zinc-400">URL 없음</span>
                      )}
                    </dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
        <div className="hidden max-h-[70vh] w-full min-w-0 overflow-x-hidden overflow-y-auto md:block">
          <table className="w-full min-w-0 table-fixed text-left text-xs">
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
                <th className="px-1 py-1.5 sm:px-2 font-medium">크리에이터</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">캠페인</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">광고주</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">제안 상태</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">처리 일시</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">제안가</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">예상 수수료</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">채널</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((bid) => {
                const row = bidView(bid, auctionById, payouts, profileByKey);
                const lifecycle = row.lifecycle;
                const campaign = row.campaign;
                const advertiser = row.advertiser;
                const email = row.email;
                const account = row.account;
                const creatorFee = row.creatorFee;
                const platformNet = row.platformNet;

                return (
                  <tr key={bid.id} className="border-b border-zinc-100 last:border-0">
                    <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 align-top sm:px-2">
                      <p
                        className="min-w-0 max-w-[120px] truncate font-medium text-zinc-950"
                        title={bid.creatorName || '이름 없음'}
                      >
                        {bid.creatorName || '이름 없음'}
                      </p>
                      <AdminCopyText value={email} emptyLabel="이메일 없음" className="mt-1 max-w-[120px]" />
                      <AdminCopyText value={account} emptyLabel="계좌 미등록" className="mt-0.5 max-w-[120px]" />
                    </td>
                    <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 align-top text-ellipsis whitespace-nowrap text-zinc-600 sm:px-2">
                      <span className="block min-w-0 max-w-[120px] truncate" title={campaign}>
                        {campaign}
                      </span>
                    </td>
                    <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 align-top text-ellipsis whitespace-nowrap text-zinc-600 sm:px-2">
                      <span className="block min-w-0 truncate" title={advertiser}>
                        {advertiser}
                      </span>
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-1 text-xs font-semibold',
                          ADMIN_BID_STATUS_CLASS[lifecycle],
                        )}
                      >
                        {ADMIN_BID_STATUS_LABEL[lifecycle]}
                      </span>
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top whitespace-nowrap text-zinc-600">
                      {row.processedAt}
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top font-medium whitespace-nowrap text-zinc-950">
                      {formatWon(bid.bidAmount)}
                    </td>
                    <td
                      className="min-w-0 px-1 py-1.5 sm:px-2 align-top whitespace-nowrap text-zinc-600"
                      title={`크리에이터 구간 수수료 ${formatWon(creatorFee)} · 플랫폼 수수료 합산 ${formatWon(platformNet)}`}
                    >
                      <span className="block truncate">{formatWon(platformNet)}</span>
                      <span className="block truncate text-[10px] text-zinc-400">
                        공제 {formatWon(creatorFee)}
                      </span>
                    </td>
                    <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 align-top sm:px-2">
                      {bid.creatorChannelUrl ? (
                        <a
                          href={bid.creatorChannelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-clink-accent hover:underline"
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
        </>
      )}
    </div>
  );
}
