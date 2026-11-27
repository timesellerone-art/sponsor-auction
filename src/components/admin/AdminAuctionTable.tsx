'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Loader2 } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { ListingDeleteButton } from '@/components/ListingDeleteButton';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { downloadCsv, sortByAdminList, type AdminListSort } from '@/lib/admin-csv';
import { AUCTION_STATUS_LABEL } from '@/lib/status-labels';
import { formatAdminTimestamp, formatWon } from '@/lib/utils';
import type { AuctionAdminFilter, ProfileItem } from '@/types/admin';
import { isAwardedAuction, type AuctionItem } from '@/types/auction';

const STATUS_LABEL = AUCTION_STATUS_LABEL;

const FILTERS: { id: AuctionAdminFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '진행 중' },
  { id: 'awarded', label: '마감/낙찰' },
  { id: 'ended', label: '종료/취소' },
];

type AdminAuctionTableProps = {
  auctions: AuctionItem[];
  profiles?: ProfileItem[];
  busyId: string | null;
  onBlind: (auction: AuctionItem) => void;
  onUnblind: (auction: AuctionItem) => void;
  onDeleted?: () => void;
};

function isBlinded(auction: AuctionItem) {
  return Boolean(auction.isBlind);
}

function isAwardedCampaign(auction: AuctionItem) {
  return isAwardedAuction(auction);
}

function matchesFilter(auction: AuctionItem, filter: AuctionAdminFilter) {
  if (filter === 'active') {
    return auction.status === 'active' && !isAwardedCampaign(auction);
  }
  if (filter === 'awarded') {
    return isAwardedCampaign(auction) && auction.status !== 'cancelled';
  }
  if (filter === 'ended') {
    return auction.status === 'cancelled';
  }
  return true;
}

function AuctionManageButtons({
  auction,
  blinded,
  busy,
  anyBusy,
  compact,
  onBlind,
  onUnblind,
  onDeleted,
}: {
  auction: AuctionItem;
  blinded: boolean;
  busy: boolean;
  anyBusy: boolean;
  compact?: boolean;
  onBlind: (auction: AuctionItem) => void;
  onUnblind: (auction: AuctionItem) => void;
  onDeleted?: () => void;
}) {
  const base = compact
    ? 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50'
    : 'inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="flex flex-wrap gap-2">
      {blinded ? (
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => onUnblind(auction)}
          className={`${base} border border-clink-peach-strong text-clink-accent hover:bg-clink-peach`}
        >
          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          {busy ? '처리 중...' : '블라인드 해제'}
        </button>
      ) : (
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => onBlind(auction)}
          className={`${base} border border-zinc-200 text-zinc-700 hover:bg-zinc-50`}
        >
          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          {busy ? '처리 중...' : '블라인드 처리'}
        </button>
      )}
      <ListingDeleteButton
        kind="campaign"
        id={auction.id}
        admin
        compact={compact}
        className={`${base} border border-rose-200 text-rose-700 hover:bg-rose-50`}
        onDeleted={onDeleted}
      />
    </div>
  );
}

export function AdminAuctionTable({
  auctions,
  profiles = [],
  busyId,
  onBlind,
  onUnblind,
  onDeleted,
}: AdminAuctionTableProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AuctionAdminFilter>('all');
  const [sort, setSort] = useState<AdminListSort>('newest');
  const emailByAuthor = useMemo(() => {
    const map = new Map<string, string>();
    for (const profile of profiles) {
      map.set(profile.id, (profile.email || '').toLowerCase());
      map.set(profile.name, (profile.email || '').toLowerCase());
    }
    return map;
  }, [profiles]);

  const filtered = useMemo(() => {
    if (!Array.isArray(auctions)) {
      return [];
    }

    const keyword = query.trim().toLowerCase();
    const matched = auctions.filter((auction) => {
      if (!matchesFilter(auction, filter)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const title = (auction.title || '').toLowerCase();
      const description = (auction.description || '').toLowerCase();
      const author = (auction.authorName || '').toLowerCase();
      const email =
        (auction.authorId ? emailByAuthor.get(auction.authorId) : '') ||
        emailByAuthor.get(auction.authorName || '') ||
        '';
      return (
        title.includes(keyword) ||
        description.includes(keyword) ||
        author.includes(keyword) ||
        email.includes(keyword)
      );
    });
    return sortByAdminList(
      matched,
      sort,
      (auction) => auction.createdAt,
      (auction) => auction.budget,
    );
  }, [auctions, emailByAuthor, filter, query, sort]);

  return (
    <div className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white">
      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="캠페인 제목, 설명, 광고주 이름/이메일 검색"
        searchLabel="캠페인 검색"
        filters={FILTERS}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        actions={
          <button
            type="button"
            onClick={() => {
              downloadCsv(
                `auctions-${new Date().toISOString().slice(0, 10)}.csv`,
                ['제목', '작성자', '예산', '상태', '생성일시'],
                filtered.map((auction) => [
                  auction.title,
                  auction.authorName,
                  auction.budget,
                  isBlinded(auction) ? '블라인드' : (STATUS_LABEL[auction.status] ?? auction.status),
                  formatAdminTimestamp(auction.createdAt),
                ]),
              );
            }}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-zinc-200 px-3 text-xs font-semibold whitespace-nowrap text-zinc-700 hover:bg-zinc-50"
          >
            <Download className="size-3.5" aria-hidden />
            엑셀/CSV 다운로드
          </button>
        }
      />

      {filtered.length === 0 ? (
        <div className="p-4">
          <AdminEmptyState message="조건에 맞는 캠페인이 없습니다." />
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3 p-3 pb-24 md:hidden">
            {filtered.map((auction) => {
              const title = auction.title || '제목 없음';
              const blinded = isBlinded(auction);
              const status = auction.status ?? 'active';
              const busy = busyId === auction.id;
              const anyBusy = Boolean(busyId);
              return (
                <li key={auction.id} className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <Link
                    href={`/auctions/${auction.id}`}
                    title={title}
                    className="block break-words text-sm font-semibold leading-5 text-zinc-950 hover:underline"
                  >
                    {title}
                  </Link>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-zinc-500">작성자</dt>
                      <dd className="mt-0.5 break-words text-zinc-800">{auction.authorName || '미상'}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-zinc-500">예산</dt>
                      <dd className="mt-0.5 break-all font-medium tabular-nums text-zinc-950">
                        {formatWon(auction.budget)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-zinc-500">상태</dt>
                      <dd className="mt-0.5 break-words text-zinc-800">
                        {blinded ? '블라인드' : (STATUS_LABEL[status] ?? status)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-zinc-500">생성일자</dt>
                      <dd className="mt-0.5 break-words text-zinc-800">
                        {formatAdminTimestamp(auction.createdAt)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <AuctionManageButtons
                      auction={auction}
                      blinded={blinded}
                      busy={busy}
                      anyBusy={anyBusy}
                      onBlind={onBlind}
                      onUnblind={onUnblind}
                      onDeleted={onDeleted}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden max-h-[70vh] w-full min-w-0 overflow-x-hidden overflow-y-auto md:block">
          <table className="w-full min-w-0 table-fixed text-left text-xs">
            <colgroup>
              <col className="w-[28%]" />
              <col className="w-[16%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[20%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-1 py-1.5 sm:px-2 font-medium">제목</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">작성자</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">예산</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">상태</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">생성일자</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((auction) => {
                const title = auction.title || '제목 없음';
                const blinded = isBlinded(auction);
                const status = auction.status ?? 'active';
                const busy = busyId === auction.id;
                const anyBusy = Boolean(busyId);

                return (
                  <tr
                    key={auction.id}
                    className="border-b border-zinc-100 last:border-0"
                  >
                    <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 align-top text-ellipsis whitespace-nowrap sm:px-2">
                      <Link
                        href={`/auctions/${auction.id}`}
                        title={title}
                        className="block min-w-0 max-w-[120px] truncate font-medium text-zinc-950 hover:underline"
                      >
                        {title}
                      </Link>
                    </td>
                    <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 align-top text-ellipsis whitespace-nowrap text-zinc-600 sm:px-2">
                      <span className="block min-w-0 max-w-[120px] truncate" title={auction.authorName || '미상'}>
                        {auction.authorName || '미상'}
                      </span>
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top font-medium whitespace-nowrap text-zinc-950">
                      {formatWon(auction.budget)}
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top whitespace-nowrap text-zinc-600">
                      {blinded ? '블라인드' : (STATUS_LABEL[status] ?? status)}
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top whitespace-nowrap text-zinc-600">
                      {formatAdminTimestamp(auction.createdAt)}
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top">
                      <AuctionManageButtons
                        auction={auction}
                        blinded={blinded}
                        busy={busy}
                        anyBusy={anyBusy}
                        compact
                        onBlind={onBlind}
                        onUnblind={onUnblind}
                        onDeleted={onDeleted}
                      />
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
