'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import {
  enrichPayout,
  filterPayoutsByPeriod,
  summarizePayouts,
} from '@/lib/payout-stats';
import { applyPaidPayoutLocal } from '@/lib/payouts';
import { formatDate, formatWon } from '@/lib/utils';
import type { PayoutItem, PayoutPeriodFilter, PayoutStatus } from '@/types/admin';

const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: '지급 대기',
  paid: '지급 완료',
};

const PERIODS: { id: PayoutPeriodFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'today', label: '오늘' },
  { id: '7d', label: '최근 7일' },
  { id: 'month', label: '이번 달' },
  { id: 'range', label: '날짜 범위' },
];

type AdminPayoutTableProps = {
  payouts: PayoutItem[];
  busyId: string | null;
  onApprove: (payout: PayoutItem) => void | Promise<void | PayoutItem | null>;
  onRefresh?: () => void | Promise<void>;
};

export function AdminPayoutTable({
  payouts,
  busyId,
  onApprove,
  onRefresh,
}: AdminPayoutTableProps) {
  const router = useRouter();
  const [period, setPeriod] = useState<PayoutPeriodFilter>('all');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [rows, setRows] = useState<PayoutItem[]>(() =>
    Array.isArray(payouts) ? payouts : [],
  );

  useEffect(() => {
    const incoming = Array.isArray(payouts) ? payouts : [];
    setRows((prev) => {
      const paid = prev.filter((item) => item.status === 'paid');
      return paid.reduce((list, item) => applyPaidPayoutLocal(list, item), incoming);
    });
  }, [payouts]);

  const filtered = useMemo(() => {
    const list = rows.map(enrichPayout);
    return filterPayoutsByPeriod(list, period, rangeFrom, rangeTo);
  }, [rows, period, rangeFrom, rangeTo]);

  const stats = useMemo(() => summarizePayouts(filtered), [filtered]);

  const markPaidLocally = (payout: PayoutItem, extra?: Partial<PayoutItem>) => {
    setRows((prev) =>
      applyPaidPayoutLocal(prev, {
        ...payout,
        ...extra,
        status: 'paid',
        paidAt: extra?.paidAt || payout.paidAt || new Date().toISOString(),
      }),
    );
  };

  const handleApprove = async (payout: PayoutItem) => {
    const result = await onApprove(payout);
    if (result && typeof result === 'object' && result.status === 'paid') {
      markPaidLocally(payout, result);
      router.refresh();
      await onRefresh?.();
    }
  };

  if (!Array.isArray(rows) || rows.length === 0) {
    return <AdminEmptyState message="정산 요청이 없습니다." />;
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">총 결제/입찰 금액</p>
          <p className="mt-2 truncate text-lg font-bold text-zinc-950">{formatWon(stats.volume)}</p>
        </article>
        <article className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">플랫폼 총 수수료 수익</p>
          <p className="mt-2 truncate text-lg font-bold text-teal-800">{formatWon(stats.fees)}</p>
        </article>
        <article className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">크리에이터 지급 완료액</p>
          <p className="mt-2 truncate text-lg font-bold text-emerald-800">{formatWon(stats.paid)}</p>
        </article>
        <article className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-xs font-medium text-zinc-500">크리에이터 지급 대기액</p>
          <p className="mt-2 truncate text-lg font-bold text-amber-800">{formatWon(stats.pending)}</p>
        </article>
      </div>

      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setPeriod(item.id)}
              className={
                period === item.id
                  ? 'h-8 shrink-0 rounded-full bg-white px-3 text-xs font-semibold text-zinc-950 shadow-sm'
                  : 'h-8 shrink-0 rounded-full px-3 text-xs font-semibold text-zinc-500'
              }
            >
              {item.label}
            </button>
          ))}
        </div>
        {period === 'range' ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <label className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
              시작
              <input
                type="date"
                value={rangeFrom}
                onChange={(event) => setRangeFrom(event.target.value)}
                className="h-9 rounded-xl border border-zinc-200 px-2 text-sm text-zinc-900"
              />
            </label>
            <label className="flex min-w-0 items-center gap-2 text-xs text-zinc-500">
              종료
              <input
                type="date"
                value={rangeTo}
                onChange={(event) => setRangeTo(event.target.value)}
                className="h-9 rounded-xl border border-zinc-200 px-2 text-sm text-zinc-900"
              />
            </label>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <AdminEmptyState message="선택한 기간의 정산 내역이 없습니다." />
      ) : (
        <div className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white">
          <div className="max-h-[70vh] w-full min-w-0 overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[960px] table-fixed text-left text-sm">
              <colgroup>
                <col className="w-[18%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[8%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-4 py-3 font-medium">크리에이터</th>
                  <th className="px-4 py-3 font-medium">캠페인</th>
                  <th className="px-4 py-3 font-medium">결제 일시</th>
                  <th className="px-4 py-3 font-medium">수수료(공제액)</th>
                  <th className="px-4 py-3 font-medium">실지급액</th>
                  <th className="px-4 py-3 font-medium">총 입찰 금액</th>
                  <th className="px-4 py-3 font-medium">상태</th>
                  <th className="px-4 py-3 font-medium">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payout) => {
                  const row = enrichPayout(payout);
                  const pending = row.status === 'pending';
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
                          title={row.creatorName || '이름 없음'}
                        >
                          {row.creatorName || '이름 없음'}
                        </p>
                        <p
                          className="mt-0.5 min-w-0 overflow-hidden text-xs text-ellipsis whitespace-nowrap text-zinc-500"
                          title={row.creatorEmail || '이메일 없음'}
                        >
                          {row.creatorEmail || '이메일 없음'}
                        </p>
                      </td>
                      <td className="min-w-0 max-w-[300px] overflow-hidden px-4 py-3 align-top text-zinc-600 text-ellipsis whitespace-nowrap">
                        <span
                          className="block min-w-0 truncate"
                          title={row.auctionTitle || '연결된 캠페인 없음'}
                        >
                          {row.auctionTitle || '연결된 캠페인 없음'}
                        </span>
                      </td>
                      <td className="min-w-0 px-4 py-3 align-top whitespace-nowrap text-zinc-600">
                        {formatDate(row.paidAt || row.requestedAt)}
                      </td>
                      <td className="min-w-0 px-4 py-3 align-top whitespace-nowrap text-zinc-600">
                        {formatWon(row.platformFee ?? 0)}
                      </td>
                      <td className="min-w-0 px-4 py-3 align-top font-medium whitespace-nowrap text-zinc-950">
                        {formatWon(row.amount)}
                      </td>
                      <td className="min-w-0 px-4 py-3 align-top whitespace-nowrap text-zinc-600">
                        {formatWon(row.bidAmount ?? 0)}
                      </td>
                      <td className="min-w-0 px-4 py-3 align-top">
                        <span
                          className={
                            pending
                              ? 'rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800'
                              : 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800'
                          }
                        >
                          {STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="min-w-0 px-4 py-3 align-top">
                        {pending ? (
                          <button
                            type="button"
                            disabled={anyBusy}
                            onClick={() => {
                              void handleApprove(payout);
                            }}
                            className="inline-flex items-center gap-1 rounded-full border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                            {busy ? '처리 중...' : '지급 처리'}
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-zinc-400">지급 완료</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
