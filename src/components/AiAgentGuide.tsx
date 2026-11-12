'use client';

import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AiAnalyzeResponse, AiReport } from '@/types/ai';

type AiAgentGuideProps = {
  report: AiReport | null;
  source: AiAnalyzeResponse['source'] | null;
  loading?: boolean;
};

export function AiAgentGuide({ report, source, loading = false }: AiAgentGuideProps) {
  return (
    <section className="rounded-2xl border border-clink-border bg-white p-4 shadow-sm hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-clink text-white">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-clink">AI 에이전트 가이드</h2>
            <p className="text-xs text-clink-muted">추천 영상 콘셉트와 예상 효과</p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
            source === 'ai'
              ? 'bg-clink text-white'
              : 'bg-clink-peach text-clink-accent ring-1 ring-clink-peach-strong',
          )}
        >
          {loading ? '분석 중' : source === 'ai' ? 'AI 맞춤 분석 리포트' : '기본 추천 리포트'}
        </span>
      </div>

      {loading || !report ? (
        <div className="mt-4 space-y-3" aria-busy="true" aria-live="polite">
          <p className="text-sm text-clink-accent">AI가 캠페인 맞춤 가이드를 분석 중입니다...</p>
          <div className="h-16 animate-pulse rounded-xl bg-clink-peach" />
          <div className="h-16 animate-pulse rounded-xl bg-clink-peach/80" />
          <div className="h-16 animate-pulse rounded-xl bg-clink-peach/70" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <ol className="grid grid-cols-1 gap-3">
            {report.concepts.map((concept, index) => (
              <li
                key={`${concept.title}-${index}`}
                className="rounded-xl border border-clink-border bg-[#FAF8F5] p-3"
              >
                <p className="text-xs font-semibold tracking-wide text-clink-accent">
                  콘셉트 {index + 1}
                </p>
                <p className="mt-1 text-sm font-semibold break-keep text-clink">{concept.title}</p>
                <p className="mt-1 text-sm leading-5 text-clink-muted">{concept.summary}</p>
              </li>
            ))}
          </ol>
          <div className="rounded-xl bg-clink px-3 py-3 text-white">
            <p className="text-xs font-semibold tracking-wide text-white/80">예상 효과</p>
            <p className="mt-1 text-sm leading-5 text-white/90">{report.expectedEffect}</p>
          </div>
        </div>
      )}
    </section>
  );
}
