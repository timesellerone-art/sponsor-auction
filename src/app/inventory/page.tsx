import { Suspense } from 'react';
import { TimeslotMarketplace } from '@/components/TimeslotMarketplace';

function MarketplaceFallback() {
  return (
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
      <div className="h-4 w-28 animate-pulse rounded bg-zinc-200" />
      <div className="mt-3 h-8 w-64 animate-pulse rounded bg-zinc-200" />
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="h-80 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-80 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-80 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    </div>
  );
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<MarketplaceFallback />}>
      <TimeslotMarketplace />
    </Suspense>
  );
}
