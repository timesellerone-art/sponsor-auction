'use client';

import { ArrowRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/components/AuthProvider';
import { PageContainer } from '@/components/PageContainer';

const PROPOSALS = [
  { name: '민지', label: '민지 · 뷰티 릴스', amount: '25만 원', concept: '앰플 텍스처 매크로 훅', tone: 'bg-[#FFEDD5] text-[#EA580C]' },
  { name: '하연', label: '피부일기 하연', amount: '30만 원', concept: '7일 진정 전후 클로즈업', tone: 'bg-[#FFF7ED] text-[#1C1917]' },
  { name: '현우', label: '테크리뷰 현우', amount: '28만 원', concept: '성분 라벨 15초 하이라이트', tone: 'bg-stone-100 text-[#1C1917]' },
] as const;

export function HomeHero() {
  const { user, ready, canCreateAuction } = useAuth();

  return (
    <section className="relative isolate overflow-hidden bg-[#FAF8F5]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-24 left-[18%] h-72 w-72 rounded-full bg-[#FFF7ED] blur-3xl" />
        <div className="absolute top-24 right-[12%] h-64 w-64 rounded-full bg-[#FFEDD5]/70 blur-3xl" />
      </div>

      <PageContainer className="relative z-10 flex flex-col items-center py-16 text-center sm:py-20">
        <p className="inline-flex max-w-full items-center rounded-full bg-[#FFF7ED] px-3.5 py-1.5 text-center text-xs font-semibold text-[#EA580C] ring-1 ring-stone-900/5 sm:whitespace-nowrap sm:text-sm">
          AI 기획 가이드 기반 크리에이터 콘텐츠 매칭
        </p>
        <h1 className="mt-6 max-w-3xl text-[1.85rem] font-semibold tracking-tight text-[#1C1917] sm:text-5xl sm:leading-[1.15]">
          기획부터 매칭까지,
          <br />
          크리에이터 협업의 새로운 기준
        </h1>
        <p className="mt-5 max-w-2xl text-sm leading-6 text-[#78716C] sm:text-base">
          제품만 등록하면 AI가 촬영 콘셉트를 설계하고, 검증된 크리에이터가 맞춤 기획안을 제안합니다.
        </p>
        <div className="mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
          <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            disabled={!ready || Boolean(user && !canCreateAuction)}
            onClick={() => window.dispatchEvent(new Event('create-auction:open'))}
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl bg-[#1C1917] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
          >
            광고주 · 캠페인 등록하기
          </motion.button>
          <motion.a
            href="#auctions"
            whileHover={{ y: -2 }}
            className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl border border-[#E7E5E4] bg-white/80 px-8 py-3.5 text-sm font-semibold text-[#1C1917] shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-md ring-1 ring-stone-900/5 hover:shadow-md sm:w-auto"
          >
            크리에이터 · 오픈 캠페인 보기
          </motion.a>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.22 }}
          className="mt-12 w-full max-w-5xl overflow-hidden px-1"
        >
          <HeroShowcase />
        </motion.div>
      </PageContainer>
    </section>
  );
}

function HeroShowcase() {
  return (
    <div className="flex flex-col items-stretch justify-center gap-5 md:flex-row md:items-center">
      <motion.article
        whileHover={{ y: -6 }}
        className="w-full rounded-3xl bg-white/80 p-5 text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-stone-900/5 backdrop-blur-md md:max-w-[22rem]"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold tracking-wide text-[#EA580C]">브랜드 캠페인</p>
          <span className="rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[10px] font-semibold text-[#EA580C]">
            릴스
          </span>
        </div>
        <p className="mt-3 text-lg font-semibold tracking-tight text-[#1C1917]">
          수분 진정 시카 앰플 15초 릴스
        </p>
        <p className="mt-1 text-sm text-[#78716C]">예산 30만 원 · 모집 마감 D-4</p>
        <div className="mt-4 rounded-2xl bg-[#FAF8F5] p-3 ring-1 ring-stone-900/5">
          <p className="text-[11px] font-medium text-[#78716C]">콘셉트 초안</p>
          <p className="mt-1 text-sm leading-5 text-[#1C1917]">
            첫 3초 텍스처 매크로 → 7일 진정 전후 → CTA 저장 유도
          </p>
        </div>
        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#1C1917] px-3 py-1.5 text-[11px] font-semibold text-white">
          <Sparkles className="size-3.5 text-[#FFEDD5]" aria-hidden />
          Gemini AI 기획 가이드 생성 완료
        </div>
      </motion.article>

      <div className="relative hidden h-24 w-16 shrink-0 items-center justify-center md:flex" aria-hidden>
        <span className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-stone-300 to-transparent" />
        <motion.span
          className="absolute size-10 rounded-full bg-[#EA580C]/20"
          animate={{ scale: [1, 1.45, 1], opacity: [0.35, 0.08, 0.35] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="relative flex size-9 items-center justify-center rounded-full bg-white shadow-[0_8px_30px_rgb(0,0,0,0.06)] ring-1 ring-stone-900/5">
          <ArrowRight className="size-4 text-[#EA580C]" />
        </span>
      </div>

      <div className="relative w-full md:max-w-[24rem]">
        <p className="mb-3 text-left text-[11px] font-semibold tracking-wide text-[#78716C] md:text-center">
          실시간 콘텐츠 제안
        </p>
        <ul className="relative space-y-3">
          {PROPOSALS.map((item, index) => (
            <motion.li
              key={item.name}
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.35 + index * 0.1, duration: 0.4 }}
              whileHover={{ y: -3, x: 4 }}
              className={`flex items-center gap-3 rounded-2xl bg-white/90 px-3.5 py-3 text-left shadow-xl ring-1 ring-stone-900/5 backdrop-blur-md ${
                index === 1 ? 'md:translate-x-2' : index === 2 ? 'md:translate-x-1' : ''
              }`}
            >
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${item.tone}`}
              >
                {item.name.slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[#1C1917]">{item.label}</p>
                <p className="truncate text-xs text-[#78716C]">{item.concept}</p>
              </div>
              <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[#EA580C]">
                {item.amount} 제안
              </span>
            </motion.li>
          ))}
        </ul>
      </div>
    </div>
  );
}
