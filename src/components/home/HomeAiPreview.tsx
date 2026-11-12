'use client';

import { useMemo, useState } from 'react';
import { AiAgentGuide } from '@/components/AiAgentGuide';
import { PageContainer } from '@/components/PageContainer';
import { buildFallbackReport } from '@/lib/ai-report';
import { cn } from '@/lib/utils';

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

export function HomeAiPreview() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('launch');
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];
  const report = useMemo(() => buildFallbackReport(active.input), [active]);

  return (
    <section className="relative bg-[#FAF8F5] py-16 sm:py-20">
      <PageContainer>
        <div className="rounded-[1.75rem] bg-white/80 px-5 py-8 text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-stone-900/5 backdrop-blur-md sm:px-10 sm:py-12">
          <p className="text-sm font-semibold tracking-wide text-clink-accent">AI 에이전트 가이드</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-clink sm:text-4xl">
            캠페인 목적만 고르면 촬영 콘셉트가 바로 나옵니다
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-clink-muted sm:text-base">
            상세 페이지에서는 Gemini가 실제 캠페인 설명에 맞춰 같은 형식으로 제안합니다.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 border-b border-clink-border">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                aria-pressed={tab === item.id}
                className={cn(
                  '-mb-px whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-semibold transition-colors',
                  tab === item.id
                    ? 'border-clink text-clink'
                    : 'border-transparent text-clink-muted hover:text-clink',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="mt-8 text-left">
            <AiAgentGuide report={report} source="ai" />
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
