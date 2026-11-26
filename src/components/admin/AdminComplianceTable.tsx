import { formatAdminTimestamp } from '@/lib/utils';
import type { ComplianceLog } from '@/types/compliance';

const SOURCE_LABEL: Record<ComplianceLog['source'], string> = {
  bid: '제안',
  chat: '채팅',
  timeslot_bid: '상품 제안',
};

export function AdminComplianceTable({ logs }: { logs: ComplianceLog[] }) {
  return (
    <div className="min-w-0 rounded-2xl border border-zinc-200 bg-white">
      <ul className="flex flex-col gap-3 p-3 pb-24 md:hidden">
        {logs.map((log) => (
          <li key={log.id} className="rounded-2xl border border-zinc-200 bg-white p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-700">
                {SOURCE_LABEL[log.source] ?? log.source}
              </span>
              <span
                className={
                  log.blocked
                    ? 'rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800'
                    : 'rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800'
                }
              >
                {log.blocked ? '차단' : '기록'}
              </span>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="min-w-0">
                <dt className="text-[11px] font-medium text-zinc-500">시각</dt>
                <dd className="mt-0.5 break-words text-zinc-800">{formatAdminTimestamp(log.createdAt)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-medium text-zinc-500">키워드</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {log.keywords.map((keyword) => (
                    <span
                      key={`${log.id}-${keyword}`}
                      className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800"
                    >
                      {keyword}
                    </span>
                  ))}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-medium text-zinc-500">발췌</dt>
                <dd className="mt-0.5 break-words text-xs leading-5 text-zinc-600">{log.snippet || '-'}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-semibold text-zinc-500">
            <tr>
              <th className="px-4 py-3">시각</th>
              <th className="px-4 py-3">출처</th>
              <th className="px-4 py-3">키워드</th>
              <th className="px-4 py-3">처리</th>
              <th className="px-4 py-3">발췌</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-zinc-100">
                <td className="whitespace-nowrap px-4 py-3 text-xs text-zinc-500">
                  {formatAdminTimestamp(log.createdAt)}
                </td>
                <td className="px-4 py-3">{SOURCE_LABEL[log.source] ?? log.source}</td>
                <td className="px-4 py-3">
                  <div className="flex max-w-xs flex-wrap gap-1">
                    {log.keywords.map((keyword) => (
                      <span
                        key={`${log.id}-${keyword}`}
                        className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-800"
                      >
                        {keyword}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      log.blocked
                        ? 'rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-800'
                        : 'rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800'
                    }
                  >
                    {log.blocked ? '차단' : '기록'}
                  </span>
                </td>
                <td className="max-w-sm px-4 py-3 text-xs text-zinc-600">
                  <span className="line-clamp-2">{log.snippet || '-'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
