'use client';

import { Play } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/components/AuthProvider';
import { CreatorAvatar } from '@/components/home/CreatorAvatar';
import { LANDING_INTRO } from '@/components/home/landing-audience';
import { LandingRoleToggle } from '@/components/home/LandingRoleToggle';
import { useLandingAudience } from '@/components/home/LandingAudienceProvider';
import { getShowcaseCreator, SHORTFORM_CARDS } from '@/components/home/showcase';
import { PageContainer } from '@/components/PageContainer';
import { cn } from '@/lib/utils';

export function HomeHero() {
  const { ready } = useAuth();
  const { audience } = useLandingAudience();
  const copy = LANDING_INTRO[audience];
  const createDisabled = !ready;

  const openCreateAuction = () => {
    window.dispatchEvent(new Event('create-auction:open'));
  };

  const scrollToAuctions = () => {
    document.getElementById('auctions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="relative isolate overflow-hidden bg-[#FAF8F5]">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-24 left-[18%] h-72 w-72 rounded-full bg-[#FFF7ED] blur-3xl" />
        <div className="absolute top-24 right-[12%] h-64 w-64 rounded-full bg-[#FFEDD5]/70 blur-3xl" />
      </div>

      <PageContainer className="relative z-10 flex flex-col items-center py-16 text-center sm:py-20">
        <LandingRoleToggle />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={audience}
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="flex w-full flex-col items-center"
          >
            <p className="mt-6 inline-flex max-w-full items-center rounded-full bg-[#FFF7ED] px-3.5 py-1.5 text-center text-xs font-semibold text-[#EA580C] ring-1 ring-stone-900/5 sm:whitespace-nowrap sm:text-sm">
              {copy.eyebrow}
            </p>
            <h1 className="mt-6 max-w-3xl text-[1.7rem] font-bold tracking-[-0.03em] leading-[1.2] text-[#1C1917] sm:text-5xl sm:leading-[1.15]">
              {copy.headline}
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-6 text-[#78716C] sm:text-base">{copy.sub}</p>
            <div className="mt-8 flex w-full flex-col items-center justify-center sm:w-auto">
              {audience === 'advertiser' ? (
                <motion.button
                  type="button"
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={createDisabled}
                  onClick={openCreateAuction}
                  className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl bg-[#1C1917] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_8px_30px_rgb(0,0,0,0.08)] hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-300 sm:w-auto"
                >
                  {copy.cta}
                </motion.button>
              ) : (
                <motion.a
                  href="#auctions"
                  whileHover={{ y: -2 }}
                  onClick={(event) => {
                    event.preventDefault();
                    scrollToAuctions();
                  }}
                  className="inline-flex w-full items-center justify-center whitespace-nowrap rounded-xl bg-[#EA580C] px-8 py-3.5 text-sm font-semibold text-white shadow-[0_8px_30px_rgb(234,88,12,0.22)] hover:bg-orange-600 sm:w-auto"
                >
                  {copy.cta}
                </motion.a>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

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
