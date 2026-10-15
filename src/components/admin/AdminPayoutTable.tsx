'use client';

import { Loader2 } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { formatDate, formatWon } from '@/lib/utils';
import type { PayoutItem, PayoutStatus } from '@/types/admin';

const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: '지급 대기',
  paid: '지급 완료',
};

type AdminPayoutTableProps = {
  payouts: PayoutItem[];
  busyId: string | null;
  onApprove: (payout: PayoutItem) => void;
};

export function AdminPayoutTable({
  payouts,
  busyId,
  onApprove,
}: AdminPayoutTableProps) {
  if (!Array.isArray(payouts) || payouts.length === 0) {
    return <AdminEmptyState message="정산 요청이 없습니다." />;
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white">
      <div className="max-h-[70vh] w-full min-w-0 overflow-x-auto overflow-y-auto">
        <table className="w-full min-w-[800px] table-fixed text-left text-sm">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[28%]" />
            <col className="w-[14%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">크리에이터</th>
              <th className="px-4 py-3 font-medium">캠페인</th>
              <th className="px-4 py-3 font-medium">정산 금액</th>
              <th className="px-4 py-3 font-medium">결제/정산 일시</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {payouts.map((payout) => {
              const pending = payout.status === 'pending';
              const busy = busyId === payout.id;
              const anyBusy = Boolean(busyId);

              return (
                <tr
                  key={payout.id}
                  className="border-b border-zinc-100 last:border-0"
                >
                  <td className="min-w-0 max-w-[220px] overflow-hidden px-4 py-3 align-top">
                    <p
                      className="min-w-0 overflow-hidden font-medium text-ellipsis whitespace-nowrap text-zinc-950"
                      title={payout.creatorName || '이름 없음'}
                    >
                      {payout.creatorName || '이름 없음'}
                    </p>
                    <p
                      className="mt-0.5 min-w-0 overflow-hidden text-xs text-ellipsis whitespace-nowrap text-zinc-500"
                      title={payout.creatorEmail || '이메일 없음'}
                    >
                      {payout.creatorEmail || '이메일 없음'}
                    </p>
                  </td>
                  <td className="min-w-0 max-w-[300px] overflow-hidden px-4 py-3 align-top text-zinc-600 text-ellipsis whitespace-nowrap">
                    <span
                      className="block min-w-0 truncate"
                      title={payout.auctionTitle || '연결된 캠페인 없음'}
                    >
                      {payout.auctionTitle || '연결된 캠페인 없음'}
                    </span>
                  </td>
                  <td className="min-w-0 px-4 py-3 align-top font-medium whitespace-nowrap text-zinc-950">
                    {formatWon(payout.amount)}
                  </td>
                  <td className="min-w-0 px-4 py-3 align-top whitespace-nowrap text-zinc-600">
                    {formatDate(payout.requestedAt)}
                  </td>
                  <td className="min-w-0 px-4 py-3 align-top">
                    <span
                      className={
                        pending
                          ? 'rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800'
                          : 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800'
                      }
                    >
                      {STATUS_LABEL[payout.status] ?? payout.status}
                    </span>
                  </td>
                  <td className="min-w-0 px-4 py-3 align-top">
                    {pending ? (
                      <button
                        type="button"
                        disabled={anyBusy}
                        onClick={() => onApprove(payout)}
                        className="inline-flex items-center gap-1 rounded-full border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                        {busy ? '처리 중...' : '지급 처리'}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-400">처리 완료</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
