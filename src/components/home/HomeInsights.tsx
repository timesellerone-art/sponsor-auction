import { PageContainer } from '@/components/PageContainer';

const TOP_CONTENT = [
  {
    rank: 1,
    views: '32K',
    platform: '릴스',
    hook: '권위 + 반대 의견으로 시작',
    quote: '완벽한 계획은 미루기의 다른 말',
  },
  {
    rank: 2,
    views: '25K',
    platform: '쇼츠',
    hook: '실제 사용 전후 클로즈업',
    quote: '하루 만에 달라진 피부 결',
  },
];

export function HomeInsights() {
  return (
    <section className="bg-[#FAF8F5] pb-20">
      <PageContainer className="grid gap-10 rounded-[1.75rem] border border-stone-200/80 bg-white px-5 py-10 shadow-sm sm:px-8 lg:grid-cols-2 lg:gap-16 lg:px-12 lg:py-14">
        <article>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            어떤 크리에이터와 포맷이 실제로 통하는지 보여줍니다
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-stone-500 sm:text-base">
            Clink는 크리에이터·플랫폼·포맷 조합이 타깃에게 어떻게 먹혔는지 패턴으로 풀어, 숫자
            너머의 기획 힌트를 줍니다.
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200/80 bg-[#FAF8F5]">
            <div className="grid grid-cols-2 gap-3 p-4">
              <div className="rounded-2xl border border-stone-200/80 bg-white p-4">
                <p className="text-[11px] font-medium text-stone-400">도달</p>
                <p className="mt-1 text-2xl font-semibold text-stone-900">10.1M</p>
                <span className="mt-3 block h-8 w-full rounded-md bg-gradient-to-r from-emerald-100 to-emerald-400/80" />
              </div>
              <div className="rounded-2xl border border-stone-200/80 bg-white p-4">
                <p className="text-[11px] font-medium text-stone-400">콘텐츠당 조회</p>
                <p className="mt-1 text-2xl font-semibold text-stone-900">17K</p>
                <span className="mt-3 block h-8 w-full rounded-md bg-gradient-to-r from-emerald-100 to-lime-400/80" />
              </div>
            </div>
            <div className="border-t border-stone-200/80 bg-white px-4 py-4">
              <p className="mb-3 text-sm font-semibold text-stone-900">성과가 좋은 콘텐츠</p>
              <ol className="space-y-3">
                {TOP_CONTENT.map((item) => (
                  <li key={item.rank} className="rounded-xl border border-stone-100 bg-[#FAF8F5] px-3 py-3">
                    <p className="text-sm font-semibold text-stone-900">
                      {item.rank}. {item.views} views · {item.platform}
                    </p>
                    <p className="mt-1 text-xs text-stone-500">훅 {item.hook}</p>
                    <p className="mt-0.5 text-xs text-stone-400">“{item.quote}”</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </article>

        <article>
          <h2 className="text-2xl font-semibold tracking-tight text-stone-900 sm:text-3xl">
            이번 성과를 다음 캠페인 전략으로 넘깁니다
          </h2>
          <p className="mt-3 max-w-md text-sm leading-6 text-stone-500 sm:text-base">
            지난 오픈 캠페인의 패턴을 읽어, 다시 쓸 크리에이터·플랫폼·포맷을 제안합니다. 캠페인을
            반복할수록 매칭이 더 정확해집니다.
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
            <div className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-800">
              Clink 인사이트 · 신제품 런칭
            </div>
            <ul className="divide-y divide-stone-100 text-sm">
              <li className="px-4 py-4">
                <p className="font-medium text-stone-900">이번 캠페인 도달 목표가 18% 초과했습니다</p>
              </li>
              <li className="px-4 py-4 text-stone-600">
                팔로워 2만~15만 구간의 뷰티 크리에이터가 대표 계정 대비 CPM이 45% 더 효율적이었습니다.
              </li>
              <li className="px-4 py-4">
                <p className="font-semibold text-stone-900">다음 오픈 캠페인 시작하기</p>
                <p className="mt-1 text-sm leading-6 text-stone-500">
                  새 캠페인을 열면, 이번 학습이 콘셉트와 크리에이터 매칭에 바로 반영됩니다.
                </p>
              </li>
            </ul>
          </div>
        </article>
      </PageContainer>
    </section>
  );
}
