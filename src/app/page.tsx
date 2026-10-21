'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { AuctionBrowseBar } from '@/components/AuctionBrowseBar';
import { AuctionCard, AuctionCardSkeleton } from '@/components/AuctionCard';
import { useAuth } from '@/components/AuthProvider';
import { PageContainer } from '@/components/PageContainer';
import {
  browseAuctions,
  type BrowsePlatformFilter,
  type BrowseSort,
} from '@/lib/auction-browse';
import { getAuctions } from '@/lib/auctions';
import type { AuctionItem } from '@/types/auction';

export default function Home() {
  const { user, ready, canCreateAuction, canPlaceBid } = useAuth();
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<BrowsePlatformFilter>('all');
  const [sort, setSort] = useState<BrowseSort>('newest');

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

  const browsed = useMemo(
    () => browseAuctions(auctions, { query, platform, sort }),
    [auctions, platform, query, sort],
  );
  const isEmpty = !loading && browsed.open.length === 0 && browsed.closed.length === 0;
  const isAdvertiser = Boolean(ready && canCreateAuction);
  const isCreator = Boolean(ready && canPlaceBid);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <section className="border-b border-zinc-200 bg-gradient-to-b from-teal-50 to-background">
        <PageContainer className="flex flex-col gap-5 py-10 sm:gap-6 sm:py-16 lg:py-20">
          <p className="text-sm font-semibold tracking-wide text-teal-800">
            마이크로 스폰서십 역경매
          </p>
          <h1 className="max-w-3xl text-3xl font-bold tracking-tight break-keep text-zinc-950 sm:text-4xl lg:text-5xl">
            광고주는 예산을 올리고,
            <br className="hidden sm:block" /> 크리에이터가 제안합니다.
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base">
            {isAdvertiser
              ? '지금 입찰이 열린 역경매와 내가 등록한 캠페인을 메인에서 바로 확인하세요. 제안이 들어오면 상세에서 낙찰할 수 있습니다.'
              : isCreator
                ? 'Shorts·Reels·TikTok부터 YouTube, Threads, 블로그, X까지 플랫폼 필터로 골라, 예산과 마감에 맞는 제안에 입찰하세요.'
                : '다양한 크리에이터 채널 캠페인을 역경매로 매칭하세요. 원하는 플랫폼과 예산을 올리면, 크리에이터가 입찰가로 경쟁합니다.'}
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
            <Link
              href="/inventory"
              className="inline-flex h-11 w-full items-center justify-center rounded-full border border-teal-200 bg-teal-50 px-5 text-sm font-semibold text-teal-900 hover:bg-teal-100 sm:w-auto"
            >
              타임슬롯 인벤토리
            </Link>
          </div>
        </PageContainer>
      </section>

      <PageContainer
        id="auctions"
        className="flex-1 py-10 sm:py-14"
      >
        <div className="mb-5 flex flex-col gap-1 sm:mb-6">
          <h2 className="text-xl font-bold text-zinc-950 sm:text-2xl">
            진행 중인 역경매
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            {isAdvertiser
              ? '입찰이 열려 있는 캠페인입니다. 내 캠페인은 카드에서 바로 구분됩니다.'
              : '제목·설명 검색과 플랫폼 필터로 맞는 캠페인을 찾으세요.'}
          </p>
        </div>

        <div className="mb-6">
          <AuctionBrowseBar
            query={query}
            platform={platform}
            sort={sort}
            onQueryChange={setQuery}
            onPlatformChange={setPlatform}
            onSortChange={setSort}
          />
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
              {query.trim() || platform !== 'all'
                ? '조건에 맞는 역경매가 없습니다'
                : '등록된 역경매가 없습니다'}
            </p>
            {error ? (
              <p className="mt-2 text-sm text-zinc-500">{error}</p>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <div>
              {browsed.open.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500">
                  지금 입찰 가능한 역경매가 없습니다.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {browsed.open.map((auction) => (
                    <AuctionCard key={auction.id} auction={auction} />
                  ))}
                </div>
              )}
            </div>

            {browsed.closed.length > 0 ? (
              <div>
                <h3 className="mb-4 text-lg font-bold text-zinc-950">마감·완료된 역경매</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {browsed.closed.map((auction) => (
                    <AuctionCard key={auction.id} auction={auction} />
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </PageContainer>
    </div>
  );
}
