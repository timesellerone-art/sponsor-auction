'use client';

import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

type FilterOption<T extends string> = {
  id: T;
  label: string;
};

type AdminFilterBarProps<T extends string> = {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  searchLabel: string;
  filters: FilterOption<T>[];
  filter: T;
  onFilterChange: (value: T) => void;
};

export function AdminFilterBar<T extends string>({
  query,
  onQueryChange,
  placeholder,
  searchLabel,
  filters,
  filter,
  onFilterChange,
}: AdminFilterBarProps<T>) {
  return (
    <div className="flex min-w-0 flex-col gap-3 border-b border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{searchLabel}</span>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-xl border border-zinc-200 py-2 pr-3 pl-9 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        />
      </label>
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => onFilterChange(item.id)}
            className={cn(
              'h-8 shrink-0 rounded-full px-3 text-xs font-semibold whitespace-nowrap',
              filter === item.id ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
