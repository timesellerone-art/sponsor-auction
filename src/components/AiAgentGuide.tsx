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
    <section className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white">
            <Sparkles className="size-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-zinc-950">AI 에이전트 가이드</h2>
            <p className="text-xs text-zinc-500">추천 영상 콘셉트와 예상 효과</p>
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium',
            source === 'ai'
              ? 'bg-teal-700 text-white'
              : 'bg-white text-teal-800 ring-1 ring-teal-200',
          )}
        >
          {loading ? '분석 중' : source === 'ai' ? 'AI 리포트' : '기본 추천 리포트'}
        </span>
      </div>

      {loading || !report ? (
        <div className="mt-4 space-y-3" aria-busy="true" aria-live="polite">
          <span className="sr-only">AI 가이드를 준비하고 있습니다.</span>
          <div className="h-16 animate-pulse rounded-xl bg-white/80" />
          <div className="h-16 animate-pulse rounded-xl bg-white/80" />
          <div className="h-16 animate-pulse rounded-xl bg-white/70" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <ol className="grid grid-cols-1 gap-3">
            {report.concepts.map((concept, index) => (
              <li
                key={`${concept.title}-${index}`}
                className="rounded-xl border border-white bg-white/90 p-3"
              >
                <p className="text-xs font-semibold tracking-wide text-teal-800">
                  콘셉트 {index + 1}
                </p>
                <p className="mt-1 text-sm font-semibold break-keep text-zinc-950">
                  {concept.title}
                </p>
                <p className="mt-1 text-sm leading-5 text-zinc-600">{concept.summary}</p>
              </li>
            ))}
          </ol>
          <div className="rounded-xl bg-teal-700 px-3 py-3 text-white">
            <p className="text-xs font-semibold tracking-wide text-teal-100">예상 효과</p>
            <p className="mt-1 text-sm leading-5 text-teal-50">{report.expectedEffect}</p>
          </div>
        </div>
      )}
    </section>
  );
}
