'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AUCTION_STATUS_LABEL } from '@/lib/status-labels';
import { cn, formatDate, formatWon } from '@/lib/utils';
import type { AuctionAdminFilter } from '@/types/admin';
import type { AuctionItem } from '@/types/auction';

const STATUS_LABEL = AUCTION_STATUS_LABEL;

const FILTERS: { id: AuctionAdminFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '진행중' },
  { id: 'closed', label: '마감' },
  { id: 'blind', label: '블라인드' },
];

type AdminAuctionTableProps = {
  auctions: AuctionItem[];
  busyId: string | null;
  onBlind: (auction: AuctionItem) => void;
  onUnblind: (auction: AuctionItem) => void;
  onDelete: (auction: AuctionItem) => void;
};

function isBlinded(auction: AuctionItem) {
  return Boolean(auction.isBlind);
}

function matchesFilter(auction: AuctionItem, filter: AuctionAdminFilter) {
  const blinded = isBlinded(auction);
  if (filter === 'blind') {
    return blinded;
  }
  if (filter === 'active') {
    return !blinded && auction.status === 'active';
  }
  if (filter === 'closed') {
    return !blinded && auction.status !== 'active';
  }
  return true;
}

export function AdminAuctionTable({
  auctions,
  busyId,
  onBlind,
  onUnblind,
  onDelete,
}: AdminAuctionTableProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AuctionAdminFilter>('all');

  const filtered = useMemo(() => {
    if (!Array.isArray(auctions)) {
      return [];
    }

    const keyword = query.trim().toLowerCase();
    return auctions.filter((auction) => {
      if (!matchesFilter(auction, filter)) {
        return false;
      }

      if (!keyword) {
        return true;
      }

      const title = (auction.title || '').toLowerCase();
      const author = (auction.authorName || '').toLowerCase();
      return title.includes(keyword) || author.includes(keyword);
    });
  }, [auctions, filter, query]);

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex flex-col gap-3 border-b border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <label className="min-w-0 flex-1">
          <span className="sr-only">역경매 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="제목 또는 작성자 검색"
            className="h-10 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
        </label>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                'h-8 shrink-0 rounded-full px-3 text-xs font-semibold',
                filter === item.id
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'text-zinc-500',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-4">
          <AdminEmptyState message="조건에 맞는 역경매가 없습니다." />
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto">
          <table className="min-w-[880px] w-full text-left text-sm">
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-4 py-3 font-medium">제목</th>
                <th className="px-4 py-3 font-medium">작성자</th>
                <th className="px-4 py-3 font-medium">예산</th>
                <th className="px-4 py-3 font-medium">상태</th>
                <th className="px-4 py-3 font-medium">생성일자</th>
                <th className="px-4 py-3 font-medium">관리</th>
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
                    <td className="max-w-[240px] px-4 py-3">
                      <Link
                        href={`/auctions/${auction.id}`}
                        className="font-medium text-zinc-950 hover:underline"
                      >
                        {title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {auction.authorName || '미상'}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-950">
                      {formatWon(auction.budget)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {blinded ? '블라인드' : (STATUS_LABEL[status] ?? status)}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {formatDate(auction.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {blinded ? (
                          <button
                            type="button"
                            disabled={anyBusy}
                            onClick={() => onUnblind(auction)}
                            className="inline-flex items-center gap-1 rounded-full border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                            {busy ? '처리 중...' : '블라인드 해제'}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={anyBusy}
                            onClick={() => onBlind(auction)}
                            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                            {busy ? '처리 중...' : '블라인드 처리'}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={anyBusy}
                          onClick={() => onDelete(auction)}
                          className="inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                          {busy ? '처리 중...' : '삭제'}
                        </button>
                      </div>
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
