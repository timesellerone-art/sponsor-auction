'use client';

import { Check, Sparkles, Wallet } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/components/AuthProvider';
import { CreatorAvatar } from '@/components/home/CreatorAvatar';
import { LANDING_GUIDE } from '@/components/home/landing-audience';
import { LandingRoleToggle } from '@/components/home/LandingRoleToggle';
import { useLandingAudience } from '@/components/home/LandingAudienceProvider';
import { SHOWCASE_CREATORS } from '@/components/home/showcase';
import { PageContainer } from '@/components/PageContainer';

const cardClass =
  'min-w-0 overflow-hidden rounded-3xl bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-stone-900/5 backdrop-blur-md sm:p-6';

export function HomeHowItWorks() {
  const { ready } = useAuth();
  const { audience } = useLandingAudience();
  const copy = LANDING_GUIDE[audience];
  const createDisabled = !ready;

  const openCreateAuction = () => {
    window.dispatchEvent(new Event('create-auction:open'));
  };

  const scrollToAuctions = () => {
    document.getElementById('auctions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section id="guide" className="scroll-mt-20 bg-[#FAF8F5] pb-8 sm:pb-12">
      <PageContainer>
        <div className="mb-8 flex flex-col items-start gap-5">
          <LandingRoleToggle />
          <div className="max-w-2xl">
            <p className="text-sm font-semibold tracking-wide text-[#EA580C]">이용안내</p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.h2
                key={copy.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="mt-2 text-2xl font-bold tracking-[-0.03em] leading-[1.15] text-[#1C1917] sm:text-4xl"
              >
                {copy.title}
              </motion.h2>
            </AnimatePresence>
          </div>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={audience}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="grid gap-4 md:grid-cols-3"
          >
            {audience === 'advertiser' ? <AdvertiserSteps /> : <CreatorSteps />}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex justify-start">
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
      </PageContainer>
    </section>
  );
}

function StepHeader({
  step,
  title,
  body,
}: {
  step: string;
  title: string;
  body: string;
}) {
  return (
    <>
      <p className="text-[11px] font-semibold tracking-wide text-[#EA580C]">{step}</p>
      <h3 className="mt-2 text-lg font-bold tracking-[-0.03em] leading-[1.2] text-[#1C1917]">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-[#78716C]">{body}</p>
    </>
  );
}

function AdvertiserSteps() {
  const steps = LANDING_GUIDE.advertiser.steps;

  return (
    <>
      <motion.article whileHover={{ y: -4 }} className={cardClass}>
        <StepHeader {...steps[0]} />
        <div className="mt-5 rounded-2xl bg-[#FAF8F5] p-4 ring-1 ring-stone-900/5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
              <Sparkles className="size-3.5 text-[#EA580C]" aria-hidden />
              크리에이터용 촬영 가이드
            </span>
            <span className="text-[11px] text-[#78716C]">1:1 기준</span>
          </div>
          <ol className="space-y-2 text-left">
            {[
              { n: '01', title: '3초 훅 비교 컷', body: '텍스처 매크로로 진정 전후를 바로 보여 주세요.' },
              { n: '02', title: '7일 루틴 다이어리', body: '아침 스킨케어에 앰플을 자연스럽게 끼워 넣습니다.' },
              { n: '03', title: '저장 CTA 챌린지', body: '마지막 2초에 성분 하이라이트와 저장 유도를 넣습니다.' },
            ].map((item) => (
              <li key={item.n} className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-900/5">
                <p className="text-xs font-semibold text-[#1C1917]">
                  {item.n} {item.title}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-[#78716C]">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </motion.article>

      <motion.article whileHover={{ y: -4 }} className={cardClass}>
        <StepHeader {...steps[1]} />
        <ul className="mt-5 space-y-2">
          {SHOWCASE_CREATORS.map((creator, index) => (
            <li
              key={creator.id}
              className={
                index === 0
                  ? 'flex items-center gap-2 rounded-xl bg-[#FFF7ED] px-3 py-2 ring-1 ring-[#EA580C]/20'
                  : 'flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-stone-900/5'
              }
            >
              <CreatorAvatar
                src={creator.photo}
                alt={creator.name}
                platform={creator.platform}
                size="sm"
              />
              <span
                className={
                  index === 0
                    ? 'min-w-0 flex-1 text-xs font-semibold text-[#1C1917]'
                    : 'min-w-0 flex-1 text-xs font-medium text-[#78716C]'
                }
              >
                {creator.name} · {creator.amount}
              </span>
              {index === 0 ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#EA580C]">
                  <Check className="size-3.5" aria-hidden />
                  1명 선정
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </motion.article>

      <motion.article whileHover={{ y: -4 }} className={cardClass}>
        <StepHeader {...steps[2]} />
        <div className="mt-5 rounded-xl bg-[#FAF8F5] p-3 ring-1 ring-stone-900/5">
          <span className="inline-flex rounded-full bg-[#1C1917] px-2.5 py-1 text-[10px] font-semibold text-white">
            Toss Payments 연동
          </span>
          <ol className="mt-3 space-y-2">
            {['1. 크리에이터 1명 채택', '2. 토스 간편 결제', '3. 콘텐츠 발행 확인'].map(
              (step, index) => (
                <li key={step} className="flex items-center gap-2 text-xs font-medium text-[#1C1917]">
                  <Check
                    className={index === 0 ? 'size-3.5 text-[#EA580C]' : 'size-3.5 text-[#78716C]'}
                    aria-hidden
                  />
                  <span>{step}</span>
                </li>
              ),
            )}
          </ol>
        </div>
      </motion.article>
    </>
  );
}

function CreatorSteps() {
  const steps = LANDING_GUIDE.creator.steps;
  const matched = SHOWCASE_CREATORS[0];

  return (
    <>
      <motion.article whileHover={{ y: -4 }} className={cardClass}>
        <StepHeader {...steps[0]} />
        <div className="mt-5 rounded-2xl bg-[#FAF8F5] p-4 ring-1 ring-stone-900/5">
          <p className="text-[11px] font-semibold tracking-wide text-[#78716C]">내 채널 스타일</p>
          <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
            {['뷰티 매크로', '솔직 후기', '15초 숏폼'].map((chip) => (
              <span
                key={chip}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] ring-1 ring-stone-900/5"
              >
                {chip}
              </span>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-[#1C1917] px-3 py-2.5 text-left">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#EA580C]">
              <Sparkles className="size-3.5" aria-hidden />
              AI 제안서 초안
            </p>
            <p className="mt-1 text-xs leading-5 text-white/85">
              텍스처 클로즈업 훅으로 제품 설득력을 높인 1:1 맞춤 기획안입니다.
            </p>
          </div>
        </div>
      </motion.article>

      <motion.article whileHover={{ y: -4 }} className={cardClass}>
        <StepHeader {...steps[1]} />
        <div className="mt-5 rounded-2xl bg-[#FFF7ED] p-4 ring-1 ring-[#EA580C]/20">
          <p className="text-[11px] font-semibold tracking-wide text-[#EA580C]">1:1 매칭 확정</p>
          <div className="mt-3 flex items-center gap-2">
            <CreatorAvatar
              src={matched.photo}
              alt={matched.name}
              platform={matched.platform}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-[#1C1917]">{matched.handle}</p>
              <p className="truncate text-[11px] text-[#78716C]">협의된 콘셉트로 콘텐츠 제작</p>
            </div>
            <Check className="size-4 text-[#EA580C]" aria-hidden />
          </div>
        </div>
      </motion.article>

      <motion.article whileHover={{ y: -4 }} className={cardClass}>
        <StepHeader {...steps[2]} />
        <div className="mt-5 rounded-xl bg-[#FAF8F5] p-3 ring-1 ring-stone-900/5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1C1917] px-2.5 py-1 text-[10px] font-semibold text-white">
            <Wallet className="size-3" aria-hidden />
            캠페인 보상금 정산
          </span>
          <ol className="mt-3 space-y-2">
            {['1. 콘텐츠 업로드', '2. 검수 완료', '3. 확정 보상금 정산'].map((step, index) => (
              <li key={step} className="flex items-center gap-2 text-xs font-medium text-[#1C1917]">
                <Check
                  className={index === 2 ? 'size-3.5 text-[#EA580C]' : 'size-3.5 text-[#78716C]'}
                  aria-hidden
                />
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </motion.article>
    </>
  );
}
