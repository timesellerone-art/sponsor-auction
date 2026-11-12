import { PageContainer } from '@/components/PageContainer';

const BUBBLES = [
  {
    name: '민지',
    role: '숏폼 크리에이터',
    text: '이 기획 너무 좋아요!',
    align: 'left',
    tone: 'white',
  },
  {
    name: '하연',
    role: '뷰티 리뷰',
    text: '바로 참여할게요!',
    align: 'right',
    tone: 'green',
  },
  {
    name: '준',
    role: '챌린지 편집',
    text: '콘셉트 제안서 보냈습니다',
    align: 'left',
    tone: 'white',
  },
] as const;

export function HomeMatchingVisual() {
  return (
    <section className="py-16 sm:py-20">
      <PageContainer className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <p className="text-sm font-semibold tracking-wide text-emerald-700">크리에이터 콘텐츠 매칭</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            실제로 반응하고 기획하는{' '}
            <span className="text-stone-400">크리에이터와 연결됩니다</span>
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-stone-500 sm:text-base">
            광고주가 캠페인 의도를 올리면, 크리에이터가 콘셉트와 단가로 지원합니다. 최저가 경쟁이
            아니라 기획의 핏으로 매칭합니다.
          </p>
        </div>

        <div className="relative rounded-[2rem] border border-stone-200/80 bg-white p-5 shadow-sm sm:p-7">
          <div className="rounded-2xl bg-[#FAF8F5] px-4 py-3 text-sm text-stone-600">
            <p className="text-xs font-semibold text-emerald-800">브랜드 캠페인 제안</p>
            <p className="mt-1 leading-5">
              15초 숏폼으로 신제품의 첫 인상을 함께 만들어 주실 크리에이터를 찾고 있어요.
            </p>
          </div>
          <ul className="mt-5 space-y-4">
            {BUBBLES.map((bubble) => (
              <li
                key={bubble.text}
                className={bubble.align === 'right' ? 'flex justify-end' : 'flex justify-start'}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm ${
                    bubble.tone === 'green'
                      ? 'rounded-br-md bg-emerald-900 text-white'
                      : 'rounded-bl-md bg-white ring-1 ring-stone-200/80'
                  }`}
                >
                  <p className="text-[11px] font-semibold opacity-70">
                    {bubble.name} · {bubble.role}
                  </p>
                  <p className="mt-1 text-sm font-medium">{bubble.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </PageContainer>
    </section>
  );
}
