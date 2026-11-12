'use client';

import { Check, Lock, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import { CreatorAvatar } from '@/components/home/CreatorAvatar';
import { SHOWCASE_CREATORS } from '@/components/home/showcase';
import { PageContainer } from '@/components/PageContainer';

const cardClass =
  'overflow-hidden rounded-3xl bg-white/80 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-stone-900/5 backdrop-blur-md sm:p-6';

export function HomeHowItWorks() {
  return (
    <section id="guide" className="scroll-mt-20 bg-[#FAF8F5] pb-8 sm:pb-12">
      <PageContainer>
        <div className="mb-8 max-w-2xl">
          <p className="text-sm font-semibold tracking-wide text-[#EA580C]">이용안내</p>
          <h2 className="mt-2 text-2xl font-bold tracking-[-0.03em] leading-[1.15] text-[#1C1917] sm:text-4xl">
            등록, 제안, 정산이 한 화면에서 이어집니다
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-6 md:grid-rows-2">
          <motion.article
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            whileHover={{ y: -4 }}
            className={`${cardClass} md:col-span-4 md:row-span-2`}
          >
            <p className="text-[11px] font-semibold tracking-wide text-[#EA580C]">01 · AI 기획</p>
            <h3 className="mt-2 text-xl font-bold tracking-[-0.03em] leading-[1.15] text-[#1C1917]">
              캠페인만 올리면 촬영 콘셉트가 바로 생성됩니다
            </h3>
            <p className="mt-2 max-w-lg text-sm leading-6 text-[#78716C]">
              Gemini가 제품 설명과 예산에 맞춰 훅, 컷 구성, CTA까지 3가지 대본 초안을 만듭니다.
            </p>
            <div className="mt-5 rounded-2xl bg-[#FAF8F5] p-4 ring-1 ring-stone-900/5">
              <div className="mb-3 flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1C1917]">
                  <Sparkles className="size-3.5 text-[#EA580C]" aria-hidden />
                  AI 대본 생성
                </span>
                <span className="text-[11px] text-[#78716C]">3개 콘셉트 · 방금 전</span>
              </div>
              <ol className="space-y-2 text-left">
                {[
                  { n: '01', title: '3초 훅 비교 컷', body: '텍스처 매크로로 진정 전후를 바로 보여 주세요.' },
                  { n: '02', title: '7일 루틴 다이어리', body: '아침 스킨케어에 앰플을 자연스럽게 끼워 넣습니다.' },
                  { n: '03', title: '저장 CTA 챌린지', body: '마지막 2초에 성분 하이라이트와 저장 유도를 넣습니다.' },
                ].map((item) => (
                  <li
                    key={item.n}
                    className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-stone-900/5"
                  >
                    <p className="text-xs font-semibold text-[#1C1917]">
                      {item.n} {item.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-[#78716C]">{item.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.08 }}
            whileHover={{ y: -4 }}
            className={`${cardClass} md:col-span-2`}
          >
            <p className="text-[11px] font-semibold tracking-wide text-[#EA580C]">02 · 매칭</p>
            <h3 className="mt-2 text-lg font-bold tracking-[-0.03em] leading-[1.15] text-[#1C1917]">
              기획안과 단가를 비교해 고릅니다
            </h3>
            <ul className="mt-4 space-y-2">
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
                  {index === 0 ? <Check className="size-4 text-[#EA580C]" aria-hidden /> : null}
                </li>
              ))}
            </ul>
          </motion.article>

          <motion.article
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ delay: 0.12 }}
            whileHover={{ y: -4 }}
            className={`${cardClass} md:col-span-2`}
          >
            <p className="text-[11px] font-semibold tracking-wide text-[#EA580C]">03 · 안전 정산</p>
            <h3 className="mt-2 text-lg font-bold tracking-[-0.03em] leading-[1.15] text-[#1C1917]">
              에스크로로 결제부터 정산까지
            </h3>
            <div className="mt-4 rounded-xl bg-[#FAF8F5] p-3 ring-1 ring-stone-900/5">
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 text-[#1C1917]">
                  <Lock className="size-3.5 text-[#EA580C]" aria-hidden />
                  에스크로 보호 중
                </span>
                <span className="text-[#EA580C]">66%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
                <motion.div
                  className="h-full rounded-full bg-[#EA580C]"
                  initial={{ width: '0%' }}
                  whileInView={{ width: '66%' }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: 0.2 }}
                />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-1 text-center text-[10px] text-[#78716C]">
                <span className="font-semibold text-[#1C1917]">결제 완료</span>
                <span className="font-semibold text-[#EA580C]">제작 중</span>
                <span>정산 대기</span>
              </div>
            </div>
          </motion.article>
        </div>
      </PageContainer>
    </section>
  );
}
