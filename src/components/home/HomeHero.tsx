'use client';

import { useAuth } from '@/components/AuthProvider';
import { PageContainer } from '@/components/PageContainer';

const PILLS = [
  {
    name: '민지 · 뷰티 릴스',
    initials: '민',
    className: 'left-[4%] top-[16%]',
    tone: 'bg-rose-100 text-rose-800',
  },
  {
    name: '나이트러너 준 · 러닝 쇼츠',
    initials: '준',
    className: 'right-[4%] top-[14%]',
    tone: 'bg-emerald-100 text-emerald-800',
  },
  {
    name: '자취연구소 · 리빙 리뷰',
    initials: '자',
    className: 'left-[6%] top-[58%]',
    tone: 'bg-amber-100 text-amber-900',
  },
  {
    name: '피부일기 하연',
    initials: '하',
    className: 'right-[5%] top-[54%]',
    tone: 'bg-violet-100 text-violet-800',
  },
  {
    name: '테크리뷰 현우',
    initials: '현',
    className: 'left-[14%] bottom-[12%]',
    tone: 'bg-sky-100 text-sky-800',
  },
  {
    name: '소연 · 홈카페',
    initials: '소',
    className: 'right-[13%] bottom-[11%]',
    tone: 'bg-lime-100 text-lime-800',
  },
] as const;

export function HomeHero() {
  const { user, ready, canCreateAuction } = useAuth();

  return (
    <section className="relative isolate min-h-[84vh] overflow-hidden bg-[#FAF8F5]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-28 left-[10%] h-80 w-80 rounded-full bg-[#D1FAE5]/50 blur-3xl" />
        <div className="absolute top-6 right-[8%] h-72 w-72 rounded-full bg-[#EDE9FE]/40 blur-3xl" />
        <div className="absolute -bottom-20 left-[8%] h-96 w-96 rounded-full bg-[#FEF3C7]/40 blur-3xl" />
        <div className="absolute bottom-4 right-[16%] h-72 w-72 rounded-full bg-[#D1FAE5]/40 blur-3xl" />
      </div>

      {PILLS.map((pill) => (
        <div
          key={pill.name}
          className={`pointer-events-none absolute z-10 hidden items-center gap-2 rounded-full border border-white/80 bg-white px-3 py-1.5 shadow-sm lg:flex ${pill.className}`}
        >
          <span
            className={`flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${pill.tone}`}
          >
            {pill.initials}
          </span>
          <span className="whitespace-nowrap text-xs font-medium text-stone-700">{pill.name}</span>
        </div>
      ))}

      <PageContainer className="relative z-20 flex min-h-[84vh] flex-col items-center justify-center py-20 text-center">
        <h1 className="max-w-4xl text-3xl font-semibold tracking-tight sm:text-5xl lg:text-[3.35rem] lg:leading-[1.2]">
          <span className="block text-[#1C1917]">좋은 브랜드는 광고를 억지로 팔지 않고</span>
          <span className="mt-2 block text-[#78716C]">크리에이터와 함께 콘텐츠를 만듭니다.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-7 text-stone-500 sm:text-base">
          Clink는 브랜드와 크리에이터가 기획을 나누고, AI가 콘셉트를 다듬고, 최적의 파트너를
          연결하는 크리에이터 콘텐츠 매칭 플랫폼입니다.
        </p>
        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            disabled={!ready || Boolean(user && !canCreateAuction)}
            onClick={() => window.dispatchEvent(new Event('create-auction:open'))}
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl bg-emerald-900 px-8 py-3.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
          >
            캠페인 시작하기
          </button>
          <a
            href="#auctions"
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl border border-stone-200/80 bg-white px-8 py-3.5 text-sm font-semibold text-stone-800 shadow-sm hover:shadow-md sm:w-auto"
          >
            오픈 캠페인 둘러보기
          </a>
        </div>
      </PageContainer>
    </section>
  );
}
