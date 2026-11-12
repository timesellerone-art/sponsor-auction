'use client';

import { useAuth } from '@/components/AuthProvider';
import { PageContainer } from '@/components/PageContainer';

export function HomeHero() {
  const { user, ready, canCreateAuction } = useAuth();

  return (
    <section className="relative isolate overflow-hidden bg-[#FAF8F5]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-24 left-[18%] h-72 w-72 rounded-full bg-[#FFF7ED] blur-3xl" />
        <div className="absolute top-24 right-[12%] h-64 w-64 rounded-full bg-[#FFEDD5]/70 blur-3xl" />
      </div>

      <PageContainer className="relative z-10 flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
        <p className="inline-flex max-w-full items-center rounded-full bg-[#FFF7ED] px-3.5 py-1.5 text-center text-xs font-semibold text-[#EA580C] sm:whitespace-nowrap sm:text-sm">
          AI 기획 가이드 기반 크리에이터 콘텐츠 매칭
        </p>
        <h1 className="mt-6 max-w-4xl text-3xl font-semibold tracking-tight text-[#1C1917] sm:text-5xl sm:leading-[1.2]">
          제품만 등록하면 AI가 기획안을 짜주고,
          <br className="hidden sm:block" />
          크리에이터가 맞춤 콘텐츠를 제안합니다.
        </h1>
        <p className="mt-6 max-w-2xl text-sm leading-7 text-[#78716C] sm:text-base">
          복잡한 섭외 없이 예산과 제품 설명만 올리세요. 검증된 숏폼 크리에이터들의 기획안과 견적을
          한눈에 비교하고 바로 계약할 수 있습니다.
        </p>
        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <button
            type="button"
            disabled={!ready || Boolean(user && !canCreateAuction)}
            onClick={() => window.dispatchEvent(new Event('create-auction:open'))}
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl bg-[#1C1917] px-8 py-3.5 text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
          >
            광고주 · 캠페인 등록하기
          </button>
          <a
            href="#auctions"
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl border border-[#E7E5E4] bg-white px-8 py-3.5 text-sm font-semibold text-[#1C1917] shadow-sm hover:shadow-md sm:w-auto"
          >
            크리에이터 · 오픈 캠페인 보기
          </a>
        </div>
      </PageContainer>
    </section>
  );
}
