'use client';

import { Play } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '@/components/AuthProvider';
import { CreatorAvatar } from '@/components/home/CreatorAvatar';
import { getShowcaseCreator, SHORTFORM_CARDS } from '@/components/home/showcase';
import { PageContainer } from '@/components/PageContainer';
import { cn } from '@/lib/utils';

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
        <h1 className="mt-6 max-w-3xl text-[1.85rem] font-bold tracking-[-0.03em] leading-[1.15] text-[#1C1917] sm:text-5xl">
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
          className="mt-12 w-full max-w-4xl overflow-hidden"
        >
          <ShortformShowcase />
        </motion.div>
      </PageContainer>
    </section>
  );
}

function ShortformShowcase() {
  return (
    <div className="flex items-center justify-center overflow-hidden py-4 sm:py-6">
      {SHORTFORM_CARDS.map((card, index) => {
        const creator = getShowcaseCreator(card.creatorId);
        return (
          <motion.article
            key={card.id}
            whileHover={{ y: -12 }}
            className={cn(
              'w-[38%] max-w-[196px] shrink-0',
              index === 0 && 'z-10 origin-bottom -mr-[8%] rotate-[-8deg]',
              index === 1 && 'z-30 origin-bottom scale-[1.04]',
              index === 2 && 'z-20 origin-bottom -ml-[8%] rotate-[8deg]',
            )}
          >
            <div className="relative aspect-[9/16] overflow-hidden rounded-[1.35rem] bg-stone-200 shadow-[0_18px_40px_rgb(0,0,0,0.16)] ring-1 ring-white/80">
              <img
                src={card.cover}
                alt={`${card.title} 숏폼 프리뷰`}
                width={196}
                height={348}
                className="absolute inset-0 size-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-black/10" />
              <span className="absolute top-2.5 left-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-md">
                {card.format}
              </span>
              <span className="absolute top-[42%] left-1/2 flex size-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-xl ring-1 ring-stone-900/5 backdrop-blur-md sm:size-11">
                <Play className="ml-0.5 size-4 fill-[#1C1917] text-[#1C1917]" aria-hidden />
                <span className="sr-only">{card.title} 재생 미리보기</span>
              </span>
              <div className="absolute inset-x-1.5 bottom-1.5 rounded-2xl bg-white/90 p-1.5 text-left shadow-xl ring-1 ring-stone-900/5 backdrop-blur-md sm:inset-x-2 sm:bottom-2 sm:p-2">
                <p className="text-[10px] font-semibold tracking-wide text-[#EA580C]">{card.title}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <CreatorAvatar
                    src={creator.photo}
                    alt={creator.name}
                    platform={creator.platform}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-[#1C1917]">{creator.handle}</p>
                    <p className="truncate text-[10px] text-[#78716C]">{card.chip}</p>
                  </div>
                  <span className="shrink-0 text-[10px] font-bold text-[#EA580C]">{creator.amount}</span>
                </div>
              </div>
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
