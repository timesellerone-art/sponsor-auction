'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BrowsePlatformFilter, BrowseSort } from '@/lib/auction-browse';
import { SELECTABLE_PLATFORMS } from '@/lib/platforms';

const PLATFORMS: { id: BrowsePlatformFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  ...SELECTABLE_PLATFORMS,
];

const SORTS: { id: BrowseSort; label: string }[] = [
  { id: 'newest', label: '최신순' },
  { id: 'budget_desc', label: '높은 예산순' },
  { id: 'deadline_asc', label: '마감 임박순' },
];

type AuctionBrowseBarProps = {
  query: string;
  platform: BrowsePlatformFilter;
  sort: BrowseSort;
  onQueryChange: (value: string) => void;
  onPlatformChange: (value: BrowsePlatformFilter) => void;
  onSortChange: (value: BrowseSort) => void;
};

export function AuctionBrowseBar({
  query,
  platform,
  sort,
  onQueryChange,
  onPlatformChange,
  onSortChange,
}: AuctionBrowseBarProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3 overflow-x-clip" role="search">
      <label className="relative block min-w-0">
        <span className="sr-only">캠페인 제목 또는 설명 검색</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="캠페인 제목 또는 설명 검색"
          className="h-11 w-full min-w-0 rounded-full border border-zinc-200 bg-white py-2 pr-4 pl-10 text-sm text-zinc-950 outline-none placeholder:text-zinc-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </label>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-nowrap gap-2 overflow-x-auto whitespace-nowrap pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {PLATFORMS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={platform === item.id}
              onClick={() => onPlatformChange(item.id)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full border px-3 text-xs font-semibold',
                platform === item.id
                  ? 'border-teal-700 bg-teal-700 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SORTS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={sort === item.id}
              onClick={() => onSortChange(item.id)}
              className={cn(
                'inline-flex h-9 shrink-0 items-center rounded-full border px-3 text-xs font-semibold',
                sort === item.id
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
