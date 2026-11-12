import { PageContainer } from '@/components/PageContainer';

const METRICS = [
  { label: '참여 크리에이터', value: '128' },
  { label: '콘텐츠 제안', value: '15' },
  { label: '예상 도달', value: '2.4M' },
  { label: '참여율', value: '5.9%' },
  { label: '평균 응답', value: '18h' },
  { label: '진행 중 캠페인', value: '36' },
];

const ROWS = [
  { campaign: '무알콜 맥주 숏폼', creator: '민지쇼츠', status: '제안 검토', reach: '42만', rate: '4.2%' },
  { campaign: '비건 세럼 릴스', creator: '피부일기 하연', status: '콘텐츠 제작', reach: '28만', rate: '6.1%' },
  { campaign: '러닝화 챌린지', creator: '나이트러너 준', status: '모집 마감', reach: '91만', rate: '3.8%' },
];

export function HomeDashboardPreview() {
  return (
    <section className="border-t border-stone-200/80 bg-[#FAF8F5] py-16 sm:py-20">
      <PageContainer>
        <h2 className="text-center text-2xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          한눈에 보는 캠페인 성과와 진행 상태
        </h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-sm leading-6 text-stone-500 sm:text-base">
          누가 참여했고, 어디까지 진행됐는지, 예상 도달은 얼마인지. 광고주와 크리에이터가 같은
          화면에서 캠페인을 관리합니다.
        </p>

        <div className="mt-10 overflow-hidden rounded-[1.75rem] border border-stone-200/80 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 hidden items-end justify-center gap-2 sm:flex" aria-hidden>
            {[40, 55, 48, 72, 64, 88, 70, 96].map((height, index) => (
              <span
                key={index}
                className="w-8 rounded-t-md bg-gradient-to-t from-orange-300 to-violet-400"
                style={{ height: `${height}px` }}
              />
            ))}
          </div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-base font-semibold text-stone-900">Analytics</p>
            <span className="rounded-full bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white">
              오픈 캠페인
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {METRICS.map((item) => (
              <article
                key={item.label}
                className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-3 shadow-sm"
              >
                <p className="text-[11px] font-medium text-stone-500">{item.label}</p>
                <p className="mt-1 text-xl font-semibold tracking-tight text-stone-900">{item.value}</p>
              </article>
            ))}
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs font-semibold tracking-wide text-stone-400">
                <tr>
                  <th className="px-3 py-2">캠페인</th>
                  <th className="px-3 py-2">크리에이터</th>
                  <th className="px-3 py-2">진행 상태</th>
                  <th className="px-3 py-2">예상 도달</th>
                  <th className="px-3 py-2">참여율</th>
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.campaign} className="border-t border-stone-100">
                    <td className="px-3 py-3 font-medium text-stone-900">{row.campaign}</td>
                    <td className="px-3 py-3 text-stone-600">{row.creator}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-stone-600">{row.reach}</td>
                    <td className="px-3 py-3 text-stone-600">{row.rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </PageContainer>
    </section>
  );
}
