'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { PageContainer } from '@/components/PageContainer';
import { buildFallbackReport } from '@/lib/ai-report';
import { platformLabel } from '@/lib/platforms';
import { cn, formatWon } from '@/lib/utils';

const TABS = [
  {
    id: 'launch',
    label: '신제품 런칭',
    input: {
      title: '여름 무알콜 맥주 숏폼',
      platform: 'youtube_shorts',
      budget: 1_200_000,
      description:
        '20대 타깃 무알콜 맥주 신제품 론칭. 15초 숏폼과 실제 시음 반응이 드러나면 가산점.',
    },
  },
  {
    id: 'awareness',
    label: '브랜드 인지도',
    input: {
      title: '비건 스킨케어 릴스 리뷰',
      platform: 'instagram_reels',
      budget: 800_000,
      description:
        '민감성 피부 크리에이터 대상 7일 사용 후기. 성분 하이라이트와 전후 질감 클로즈업.',
    },
  },
  {
    id: 'viral',
    label: '숏폼 바이럴',
    input: {
      title: '러닝화 언박싱 틱톡 챌린지',
      platform: 'tiktok',
      budget: 2_100_000,
      description:
        '도심 야간 러닝 컷과 챌린지 사운드로 저장·공유를 유도하는 바이럴 숏폼.',
    },
  },
] as const;

const TIMELINE = [
  { tag: '0~3초 HOOK', tone: 'text-[#EA580C]' },
  { tag: '4~12초 MAIN', tone: 'text-white' },
  { tag: '13~15초 CTA', tone: 'text-[#FFEDD5]' },
] as const;

const CONCEPT_POINTS = [
  ['핵심 포인트: 전후 대비 클로즈업', '추천 길이: 3초 이내'],
  ['핵심 포인트: 자연스러운 일상 노출', '자막 강조 필수'],
  ['핵심 포인트: 프로필 링크·저장 유도', '엔딩 2초 집중'],
] as const;

export function HomeAiPreview() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('launch');
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];
  const report = useMemo(() => buildFallbackReport(active.input), [active]);

  return (
    <section className="relative bg-[#FAF8F5] py-16 sm:py-20">
      <PageContainer>
        <div className="rounded-3xl bg-[#1C1917] p-5 text-white shadow-[0_24px_80px_rgb(28,25,23,0.28)] sm:p-8 md:p-12">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold tracking-wide text-[#EA580C]">AI 에이전트 가이드</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] leading-[1.15] text-white sm:text-4xl">
              캠페인 목적만 고르면 촬영 콘셉트가 바로 나옵니다
            </h2>
            <p className="mt-3 text-sm leading-6 text-white/60 sm:text-base">
              상세 페이지에서는 AI가 실제 캠페인 설명에 맞춰 같은 형식으로 제안합니다.
            </p>
          </div>

          <div className="mt-8 grid gap-8 lg:grid-cols-12 lg:gap-10">
            <div className="min-w-0 lg:col-span-5">
              <div className="flex min-w-0 flex-nowrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    aria-pressed={tab === item.id}
                    className={cn(
                      'inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-xs font-semibold transition-colors',
                      tab === item.id
                        ? 'bg-[#EA580C] text-white'
                        : 'bg-white/5 text-white/70 ring-1 ring-white/10 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="mt-5 rounded-2xl bg-white/5 p-5 ring-1 ring-white/10 backdrop-blur-md">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold tracking-wide text-white/50">제품 브리프</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#EA580C] px-2.5 py-1 text-[11px] font-semibold text-white">
                    <Sparkles className="size-3" aria-hidden />
                    AI 분석 완료
                  </span>
                </div>
                <p className="mt-3 text-lg font-bold tracking-[-0.03em] leading-[1.15] text-white">
                  {active.input.title}
                </p>
                <p className="mt-2 text-sm leading-6 text-white/65">{active.input.description}</p>
                <p className="mt-4 text-xs font-medium text-white/45">
                  {platformLabel(active.input.platform)} · 예산 {formatWon(active.input.budget)}
                </p>
              </div>
            </div>

            <div className="min-w-0 space-y-3 lg:col-span-7">
              {report.concepts.map((concept, index) => {
                const slot = TIMELINE[index] ?? TIMELINE[2];
                return (
                  <motion.article
                    key={`${active.id}-${concept.title}`}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: index * 0.06 }}
                    className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur-md sm:p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          'rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold tracking-wide',
                          slot.tone,
                        )}
                      >
                        {slot.tag}
                      </span>
                      <span className="text-[11px] font-medium text-white/40">콘셉트 {index + 1}</span>
                    </div>
                    <h3 className="mt-3 text-base font-bold tracking-[-0.03em] leading-[1.15] text-white">
                      {concept.title}
                    </h3>
                    <p className="mt-1.5 text-sm leading-6 text-white/65">{concept.summary}</p>
                    <div className="mt-4 flex min-w-0 flex-wrap gap-1.5">
                      {(CONCEPT_POINTS[index] ?? CONCEPT_POINTS[2]).map((point) => (
                        <span
                          key={point}
                          className="inline-flex max-w-full rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white/80 ring-1 ring-white/10"
                        >
                          {point}
                        </span>
                      ))}
                    </div>
                  </motion.article>
                );
              })}
            </div>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
