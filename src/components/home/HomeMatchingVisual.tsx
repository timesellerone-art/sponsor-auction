import { PageContainer } from '@/components/PageContainer';

const BUBBLES = [
  { name: '민지', text: '이 기획 너무 좋아요!', className: 'left-[8%] top-[18%]' },
  { name: '하연', text: '바로 참여할게요!', className: 'left-[38%] top-[8%]' },
  { name: '준', text: '콘셉트 제안서 보냈습니다', className: 'right-[10%] top-[16%]' },
  { name: '현우', text: '이 콘셉트 좋아요', className: 'left-[14%] bottom-[28%]' },
  { name: '소연', text: '저도 들어갈게요!', className: 'right-[18%] bottom-[22%]' },
] as const;

export function HomeMatchingVisual() {
  return (
    <section className="bg-[#FAF8F5] py-16 sm:py-20">
      <div className="relative mx-4 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-violet-400 via-orange-300 to-rose-300 sm:mx-6 lg:mx-auto lg:max-w-6xl">
        <div className="pointer-events-none absolute -top-10 left-10 h-40 w-56 rounded-full bg-white/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute bottom-24 right-8 h-48 w-64 rounded-full bg-amber-100/50 blur-3xl" aria-hidden />
        <div className="px-6 pb-28 pt-14 text-center sm:px-10 sm:pt-16">
          <h2 className="text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-5xl">
            스프레드시트가 아니라,
            <br />
            스케일로 캠페인을 운영하세요.
          </h2>
        </div>
        <div className="relative z-10 -mb-px rounded-t-[1.75rem] bg-[#FAF8F5] px-6 pb-4 pt-10 sm:px-10">
          <h3 className="text-center text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            실제로 반응하고 기획하는 크리에이터와 연결됩니다
          </h3>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-6 text-stone-500 sm:text-base">
            광고주가 캠페인 의도를 올리면, 크리에이터가 콘셉트와 단가로 콘텐츠를 제안합니다.
            최저가 경쟁이 아니라 기획의 핏으로 매칭합니다.
          </p>
          <div className="mt-8 flex justify-center gap-12 text-center">
            <div>
              <p className="text-3xl font-semibold text-stone-900">8x</p>
              <p className="mt-1 text-sm text-stone-500">응답률</p>
              <p className="text-xs text-stone-400">콜드 아웃리치 대비</p>
            </div>
            <div>
              <p className="text-3xl font-semibold text-stone-900">3x</p>
              <p className="mt-1 text-sm text-stone-500">빠른 진행</p>
              <p className="text-xs text-stone-400">수기 캠페인 대비</p>
            </div>
          </div>
        </div>
      </div>

      <PageContainer className="relative mt-6">
        <div className="relative min-h-[220px] overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-white px-4 py-8 shadow-sm sm:min-h-[260px] sm:px-8">
          <div className="pointer-events-none absolute inset-8 rounded-full border border-rose-100/80" aria-hidden />
          <div className="pointer-events-none absolute inset-16 rounded-full border border-violet-100/70" aria-hidden />
          <ul className="relative flex flex-wrap items-center justify-center gap-3 sm:hidden">
            {BUBBLES.map((bubble) => (
              <li
                key={bubble.name}
                className="rounded-full border border-stone-200/80 bg-white px-3 py-2 text-xs font-medium text-stone-700 shadow-sm"
              >
                {bubble.text}
              </li>
            ))}
          </ul>
          {BUBBLES.map((bubble) => (
            <div
              key={bubble.name}
              className={`absolute hidden items-center gap-2 rounded-full border border-stone-200/80 bg-white px-3 py-2 shadow-sm sm:flex ${bubble.className}`}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-800">
                {bubble.name.slice(0, 1)}
              </span>
              <span className="whitespace-nowrap text-xs font-medium text-stone-700">{bubble.text}</span>
            </div>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
