import { PageContainer } from '@/components/PageContainer';

const METRICS = [
  { label: '참여 크리에이터', value: '128', hint: '이번 분기 매칭' },
  { label: '예상 도달', value: '2.4M', hint: '숏폼 조회 합산' },
  { label: '진행 중 캠페인', value: '36', hint: '모집·제작 단계' },
  { label: '평균 응답', value: '18h', hint: '제안 도착까지' },
];

const ROWS = [
  { campaign: '무알콜 맥주 숏폼', creator: '민지쇼츠', status: '제안 검토', reach: '42만' },
  { campaign: '비건 세럼 릴스', creator: '피부일기 하연', status: '콘텐츠 제작', reach: '28만' },
  { campaign: '러닝화 챌린지', creator: '나이트러너 준', status: '모집 마감', reach: '91만' },
];

export function HomeDashboardPreview() {
  return (
    <section className="border-t border-stone-200/80 bg-white py-16 sm:py-20">
      <PageContainer>
        <p className="text-sm font-semibold tracking-wide text-emerald-700">캠페인 성과</p>
        <h2 className="mt-3 max-w-3xl text-2xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          한눈에 보는 캠페인 성과와{' '}
          <span className="text-stone-400">진행 상태</span>
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-stone-500 sm:text-base">
          누가 참여했고, 어디까지 진행됐는지, 예상 도달은 얼마인지. 광고주와 크리에이터가 같은
          화면에서 캠페인을 관리합니다.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {METRICS.map((item) => (
            <article
              key={item.label}
              className="rounded-2xl border border-stone-200/80 bg-[#FAF8F5] p-4 shadow-sm"
            >
              <p className="text-xs font-medium text-stone-500">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-stone-900">{item.value}</p>
              <p className="mt-1 text-xs text-stone-400">{item.hint}</p>
            </article>
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#FAF8F5] text-xs font-semibold tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-3">캠페인</th>
                <th className="px-4 py-3">크리에이터</th>
                <th className="px-4 py-3">진행 상태</th>
                <th className="px-4 py-3">예상 도달</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.campaign} className="border-t border-stone-100">
                  <td className="px-4 py-3 font-medium text-stone-900">{row.campaign}</td>
                  <td className="px-4 py-3 text-stone-600">{row.creator}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-600">{row.reach}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PageContainer>
    </section>
  );
}
