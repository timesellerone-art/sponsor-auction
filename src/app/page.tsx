'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { AuctionBrowseBar } from '@/components/AuctionBrowseBar';
import { AuctionCard, AuctionCardSkeleton } from '@/components/AuctionCard';
import { useAuth } from '@/components/AuthProvider';
import { PageContainer } from '@/components/PageContainer';
import { HomeAiPreview } from '@/components/home/HomeAiPreview';
import { HomeDashboardPreview } from '@/components/home/HomeDashboardPreview';
import { HomeMatchingVisual } from '@/components/home/HomeMatchingVisual';
import {
  browseAuctions,
  type BrowsePlatformFilter,
  type BrowseSort,
} from '@/lib/auction-browse';
import { getAuctions } from '@/lib/auctions';
import type { AuctionItem } from '@/types/auction';

export default function Home() {
  const { user, ready, canCreateAuction } = useAuth();
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

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <section className="bg-[#FAF8F5]">
        <PageContainer className="flex flex-col gap-6 py-14 sm:py-20 lg:py-24">
          <h1 className="max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.15]">
            <span className="block text-stone-900">좋은 브랜드는 광고를 억지로 팔지 않고</span>
            <span className="mt-2 block text-stone-400">크리에이터와 함께 콘텐츠를 만듭니다.</span>
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-stone-500 sm:text-base">
            Clink는 브랜드와 크리에이터가 기획을 나누고, AI가 콘셉트를 다듬고, 맞는 파트너를
            연결하는 크리에이터 콘텐츠 매칭 플랫폼입니다.
          </p>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              disabled={!ready || Boolean(user && !canCreateAuction)}
              onClick={() => window.dispatchEvent(new Event('create-auction:open'))}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-900 px-6 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
            >
              캠페인 시작하기
              <ArrowRight className="size-4" aria-hidden />
            </button>
            <a
              href="#auctions"
              className="inline-flex h-12 w-full items-center justify-center rounded-full border border-stone-200/80 bg-white px-6 text-sm font-semibold text-stone-800 shadow-sm hover:shadow-md sm:w-auto"
            >
              오픈 캠페인 둘러보기
            </a>
          </div>
        </PageContainer>
      </section>

      <HomeAiPreview />

      <PageContainer id="auctions" className="flex-1 py-16 sm:py-20">
        <div className="mb-6 flex flex-col gap-2 sm:mb-8">
          <p className="text-sm font-semibold tracking-wide text-emerald-700">오픈 캠페인</p>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            진행 중인 오픈 캠페인
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-stone-500">
            실제 등록된 캠페인을 플랫폼·예산·모집 마감일로 살펴보고 콘텐츠를 제안하세요.
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
            <span className="sr-only">오픈 캠페인 목록을 불러오는 중입니다.</span>
            {Array.from({ length: 6 }).map((_, index) => (
              <AuctionCardSkeleton key={index} />
            ))}
          </div>
        ) : isEmpty ? (
          <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-6 py-16 text-center shadow-sm">
            <p className="text-base font-medium text-stone-800">
              {query.trim() || platform !== 'all'
                ? '조건에 맞는 오픈 캠페인이 없습니다'
                : '등록된 오픈 캠페인이 없습니다'}
            </p>
            {error ? <p className="mt-2 text-sm text-stone-500">{error}</p> : null}
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <div>
              {browsed.open.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-500">
                  지금 지원 가능한 오픈 캠페인이 없습니다.
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
                <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-stone-900">
                  <Sparkles className="size-4 text-emerald-600" aria-hidden />
                  모집 마감·완료된 캠페인
                </h3>
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

      <HomeMatchingVisual />
      <HomeDashboardPreview />
    </div>
  );
}
