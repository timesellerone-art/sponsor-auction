import { PageContainer } from '@/components/PageContainer';

export function HomeSplitFeatures() {
  return (
    <section className="bg-[#FAF8F5] py-16 sm:py-20">
      <PageContainer className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <article>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            AI 맞춤 기획 &amp; 크리에이터 매칭
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-stone-500 sm:text-base">
            캠페인 목적만 올리면 AI가 콘셉트를 다듬고, 오픈 캠페인에 맞는 크리에이터를 연결합니다.
            광고주는 기획의 핏을 보고 선정하면 됩니다.
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <p className="text-sm font-semibold text-stone-900">무알콜 맥주 숏폼</p>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                오픈 캠페인
              </span>
            </div>
            <div className="grid grid-cols-2 gap-px bg-stone-100">
              <div className="bg-white px-4 py-3">
                <p className="text-[11px] text-stone-400">예상 도달</p>
                <p className="mt-1 text-lg font-semibold text-stone-900">42만</p>
              </div>
              <div className="bg-white px-4 py-3">
                <p className="text-[11px] text-stone-400">콘텐츠 제안</p>
                <p className="mt-1 text-lg font-semibold text-stone-900">8건</p>
              </div>
            </div>
            <ul className="divide-y divide-stone-100 px-4">
              {['민지 · 뷰티 릴스', '피부일기 하연', '나이트러너 준'].map((name) => (
                <li key={name} className="flex items-center gap-2 py-3 text-sm text-stone-700">
                  <span className="size-7 rounded-full bg-[#FAF8F5]" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            원클릭 기획 제안 &amp; 안전 정산
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-stone-500 sm:text-base">
            크리에이터는 콘셉트와 단가로 바로 콘텐츠를 제안합니다. 선정 이후 결제·정산은 Clink가
            맡아, 실행이 아니라 기획에 집중할 수 있습니다.
          </p>
          <div className="relative mt-6 h-64">
            <div className="absolute top-8 right-0 w-[88%] rotate-3 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-md">
              <p className="text-xs font-semibold text-stone-500">준 님,</p>
              <p className="mt-2 text-sm leading-5 text-stone-700">
                러닝 쇼츠 콘셉트 제안서 보냈습니다. 15초 훅과 챌린지 사운드 포함이에요.
              </p>
            </div>
            <div className="absolute top-0 right-6 w-[88%] -rotate-2 rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-stone-900">민지 · 뷰티 릴스</p>
              <p className="mt-1 text-xs text-stone-500">콘텐츠 제안 1 · 숏폼 1편</p>
              <p className="mt-3 text-sm text-stone-700">이 기획 너무 좋아요! 바로 참여할게요.</p>
            </div>
          </div>
        </article>
      </PageContainer>
    </section>
  );
}
