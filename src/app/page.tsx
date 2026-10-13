'use client';

import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { AuctionCard, AuctionCardSkeleton } from '@/components/AuctionCard';
import { getAuctions } from '@/lib/auctions';
import type { AuctionItem } from '@/types/auction';

export default function Home() {
  const { user, ready, canCreateAuction } = useAuth();
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async (withDelay = true) => {
      setLoading(true);
      const [result] = await Promise.all([
        getAuctions(),
        withDelay
          ? new Promise((resolve) => {
              window.setTimeout(resolve, 400);
            })
          : Promise.resolve(),
      ]);

      if (cancelled) {
        return;
      }

      setAuctions(result.data);
      setError(result.error);
      setLoading(false);
    };

    void load();

    const onChanged = () => {
      void load(false);
    };

    window.addEventListener('auctions:changed', onChanged);

    return () => {
      cancelled = true;
      window.removeEventListener('auctions:changed', onChanged);
    };
  }, []);

  const isEmpty = !loading && auctions.length === 0;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <section className="border-b border-zinc-200 bg-gradient-to-b from-teal-50 to-background">
        <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-col gap-5 px-4 py-10 sm:gap-6 sm:px-6 sm:py-16 lg:py-20">
          <p className="text-sm font-semibold tracking-wide text-teal-800">
            마이크로 스폰서십 역경매
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight break-keep text-zinc-950 sm:text-4xl lg:text-5xl">
            광고주는 예산을 올리고,
            <br className="hidden sm:block" /> 크리에이터가 제안합니다.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
            숏폼·릴스·틱톡 캠페인을 역경매로 매칭하세요. 원하는 플랫폼과 예산을
            올리면, 크리에이터가 입찰가로 경쟁합니다.
          </p>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={ready && Boolean(user) && !canCreateAuction}
              onClick={() =>
                window.dispatchEvent(new Event('create-auction:open'))
              }
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-teal-700 px-5 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300 sm:w-auto"
            >
              역경매 등록
              <ArrowRight className="size-4" aria-hidden />
            </button>
            <a
              href="#auctions"
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 sm:w-auto"
            >
              진행 중인 역경매 보기
            </a>
          </div>
        </div>
      </section>

      <section
        id="auctions"
        className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-10 sm:px-6 sm:py-14"
      >
        <div className="mb-6 flex flex-col gap-1 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-zinc-950 sm:text-2xl">
              진행 중인 역경매
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              예산 안에서 가장 맞는 크리에이터를 찾으세요.
            </p>
          </div>
        </div>

        {loading ? (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            aria-busy="true"
            aria-live="polite"
          >
            <span className="sr-only">역경매 목록을 불러오는 중입니다.</span>
            {Array.from({ length: 6 }).map((_, index) => (
              <AuctionCardSkeleton key={index} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <p className="text-base font-medium text-zinc-800">
              등록된 역경매가 없습니다
            </p>
            {error ? (
              <p className="mt-2 text-sm text-zinc-500">{error}</p>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {auctions.map((auction) => (
              <AuctionCard key={auction.id} auction={auction} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
