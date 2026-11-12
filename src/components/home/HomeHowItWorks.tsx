import { PageContainer } from '@/components/PageContainer';

const STEPS = [
  {
    step: 'STEP 01',
    title: '캠페인 등록 & AI 기획안 자동 생성',
    body: '광고주가 제품 정보와 예산을 입력하면 Gemini AI가 촬영 콘셉트 3가지를 즉시 제안합니다.',
  },
  {
    step: 'STEP 02',
    title: '크리에이터 콘텐츠 기획 제안 접수',
    body: '관심 있는 크리에이터들이 자신만의 영상 아이디어와 희망 단가로 지원합니다.',
  },
  {
    step: 'STEP 03',
    title: '파트너 선택 및 안전 결제·제작',
    body: '마음에 드는 기획안을 선택해 에스크로로 안전하게 거래 완료합니다.',
  },
] as const;

export function HomeHowItWorks() {
  return (
    <section className="bg-[#FAF8F5] pb-6 sm:pb-10">
      <PageContainer>
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold tracking-wide text-[#EA580C]">이용 방법</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#1C1917] sm:text-4xl">
            등록부터 계약까지, 세 단계면 끝납니다
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((item) => (
            <article
              key={item.step}
              className="rounded-2xl border border-[#E7E5E4] bg-white p-5 shadow-sm sm:p-6"
            >
              <p className="text-xs font-semibold tracking-wide text-[#EA580C]">{item.step}</p>
              <h3 className="mt-3 text-lg font-semibold tracking-tight text-[#1C1917]">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[#78716C]">{item.body}</p>
            </article>
          ))}
        </div>
      </PageContainer>
    </section>
  );
}
