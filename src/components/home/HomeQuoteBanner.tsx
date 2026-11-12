import { PageContainer } from '@/components/PageContainer';

export function HomeQuoteBanner() {
  return (
    <section className="bg-[#FAF8F5]">
      <PageContainer className="py-16 text-center sm:py-20">
        <blockquote className="mx-auto max-w-4xl text-2xl font-semibold leading-snug tracking-tight text-stone-900 sm:text-4xl sm:leading-[1.25]">
          “크리에이터 마케팅은 되는데, 스케일이 안 됐습니다.
          <br className="hidden sm:block" />더 나은 방법이 있을 거라 생각했습니다.
          <br />
          Clink를 그렇게 만났습니다.”
        </blockquote>
        <div className="mt-8 flex flex-col items-center gap-2">
          <span className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
            서
          </span>
          <p className="text-sm font-semibold text-stone-800">서아린</p>
          <p className="text-sm text-stone-400">브랜드 마케팅 매니저</p>
        </div>
      </PageContainer>

      <div className="relative mx-4 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-violet-500 via-orange-400 to-rose-400 px-6 py-16 text-center sm:mx-6 sm:px-10 sm:py-20 lg:mx-auto lg:max-w-6xl">
        <div className="pointer-events-none absolute -top-10 right-10 h-40 w-40 rounded-full bg-white/30 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute bottom-0 left-8 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" aria-hidden />
        <p className="relative text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-5xl sm:leading-tight">
          캠페인을 스프레드시트가 아니라
          <br />
          크리에이터와 함께 만듭니다.
        </p>
      </div>
    </section>
  );
}
