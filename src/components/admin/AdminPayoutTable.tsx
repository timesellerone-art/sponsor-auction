'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2 } from 'lucide-react';
import { AdminCopyText } from '@/components/admin/AdminCopyText';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { AdminPayoutTaxModal } from '@/components/admin/AdminPayoutTaxModal';
import { showToast } from '@/components/Toast';
import { downloadCsv, sortByAdminList, type AdminListSort } from '@/lib/admin-csv';
import {
  enrichPayout,
  filterPayoutsByPeriod,
  summarizePayouts,
} from '@/lib/payout-stats';
import { applyPaidPayoutLocal } from '@/lib/payouts';
import { formatAdminTimestamp, formatWon } from '@/lib/utils';
import type {
  PayoutAdminFilter,
  PayoutItem,
  PayoutPeriodFilter,
  PayoutStatus,
} from '@/types/admin';

const STATUS_LABEL: Record<PayoutStatus, string> = {
  pending: '지급 대기',
  paid: '지급 완료',
};

const STATUS_FILTERS: { id: PayoutAdminFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'pending', label: '지급 대기' },
  { id: 'paid', label: '지급 완료' },
];

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
  onApprove: (
    payout: PayoutItem,
    options?: { silent?: boolean },
  ) => void | Promise<void | PayoutItem | null>;
  onSaveMemo?: (payout: PayoutItem, memo: string) => Promise<PayoutItem | null>;
  onRefresh?: () => void | Promise<void>;
};

export function AdminPayoutTable({
  payouts,
  busyId,
  onApprove,
  onSaveMemo,
  onRefresh,
}: AdminPayoutTableProps) {
  const router = useRouter();
  const [period, setPeriod] = useState<PayoutPeriodFilter>('all');
  const [statusFilter, setStatusFilter] = useState<PayoutAdminFilter>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<AdminListSort>('newest');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({});
  const [memoBusyId, setMemoBusyId] = useState<string | null>(null);
  const [taxPayout, setTaxPayout] = useState<PayoutItem | null>(null);
  const [rows, setRows] = useState<PayoutItem[]>(() =>
    Array.isArray(payouts) ? payouts : [],
  );

  useEffect(() => {
    const incoming = Array.isArray(payouts) ? payouts : [];
    setRows((prev) => {
      const paid = prev.filter((item) => item.status === 'paid');
      const merged = paid.reduce((list, item) => applyPaidPayoutLocal(list, item), incoming);
      return merged.map((item) => {
        const local = prev.find((row) => row.id === item.id);
        return {
          ...item,
          adminMemo: item.adminMemo || local?.adminMemo || '',
          bankAccount: item.bankAccount || local?.bankAccount || '',
        };
      });
    });
  }, [payouts]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const list = rows.map(enrichPayout).filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const name = (item.creatorName || '').toLowerCase();
      const email = (item.creatorEmail || '').toLowerCase();
      const campaign = (item.auctionTitle || '').toLowerCase();
      const memo = (item.adminMemo || '').toLowerCase();
      return (
        name.includes(keyword) ||
        email.includes(keyword) ||
        campaign.includes(keyword) ||
        memo.includes(keyword)
      );
    });
    const periodFiltered = filterPayoutsByPeriod(list, period, rangeFrom, rangeTo);
    return sortByAdminList(
      periodFiltered,
      sort,
      (item) => item.paidAt || item.requestedAt,
      (item) => item.amount,
    );
  }, [period, query, rangeFrom, rangeTo, rows, sort, statusFilter]);

  const stats = useMemo(() => summarizePayouts(filtered), [filtered]);
  const pendingVisible = filtered.filter((item) => item.status === 'pending');
  const allPendingSelected =
    pendingVisible.length > 0 && pendingVisible.every((item) => selectedIds.includes(item.id));

  const markPaidLocally = (payout: PayoutItem, extra?: Partial<PayoutItem>) => {
    setRows((prev) =>
      applyPaidPayoutLocal(prev, {
        ...payout,
        ...extra,
        status: 'paid',
        paidAt: extra?.paidAt || payout.paidAt || new Date().toISOString(),
      }),
    );
    setSelectedIds((prev) => prev.filter((id) => id !== payout.id));
  };

  const handleApprove = async (payout: PayoutItem, silent = false) => {
    const result = await onApprove(payout, { silent });
    if (result && typeof result === 'object' && result.status === 'paid') {
      markPaidLocally(payout, result);
      router.refresh();
      await onRefresh?.();
    }
    return result;
  };

  const handleBulkApprove = async () => {
    const targets = pendingVisible.filter((item) => selectedIds.includes(item.id));
    if (targets.length === 0) {
      showToast('지급 대기 중인 항목을 선택해 주세요.');
      return;
    }
    const confirmed = window.confirm(
      `선택한 ${targets.length}건을 일괄 지급 처리할까요?`,
    );
    if (!confirmed) {
      return;
    }
    let success = 0;
    for (const payout of targets) {
      const result = await handleApprove(payout, true);
      if (result && typeof result === 'object' && result.status === 'paid') {
        success += 1;
      }
    }
    if (success > 0) {
      showToast(`${success}건 지급 처리했습니다.`, 'success');
    }
  };

  const handleExport = () => {
    downloadCsv(
      `payouts-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        '크리에이터',
        '이메일',
        '계좌',
        '캠페인',
        '처리일시',
        '공급가액',
        '부가세',
        '원천징수액',
        '3.3% 공제액',
        '플랫폼수수료',
        '최종정산액',
        '실지급액',
        '입찰금액',
        '상태',
        '메모',
      ],
      filtered.map((item) => [
        item.creatorName,
        item.creatorEmail,
        item.bankAccount || '',
        item.auctionTitle,
        formatAdminTimestamp(item.paidAt || item.requestedAt),
        item.supplyAmount ?? '',
        item.vatAmount ?? '',
        item.withholdingAmount ?? '',
        item.withholdingAmount ?? '',
        item.platformFee ?? '',
        item.netPayoutAmount ?? item.amount,
        item.amount,
        item.bidAmount ?? '',
        STATUS_LABEL[item.status],
        memoDrafts[item.id] ?? item.adminMemo ?? '',
      ]),
    );
  };

  const handleSaveMemo = async (payout: PayoutItem) => {
    const memo = memoDrafts[payout.id] ?? payout.adminMemo ?? '';
    if (!onSaveMemo) {
      setRows((prev) =>
        prev.map((item) => (item.id === payout.id ? { ...item, adminMemo: memo } : item)),
      );
      showToast('메모를 저장했습니다.', 'success');
      return;
    }
    setMemoBusyId(payout.id);
    try {
      const saved = await onSaveMemo(payout, memo);
      setRows((prev) =>
        prev.map((item) =>
          item.id === payout.id ? { ...item, ...(saved ?? {}), adminMemo: memo } : item,
        ),
      );
    } finally {
      setMemoBusyId(null);
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

      <div className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white">
        <AdminFilterBar
          query={query}
          onQueryChange={setQuery}
          placeholder="크리에이터 이름, 이메일, 캠페인 제목 검색"
          searchLabel="정산 검색"
          filters={STATUS_FILTERS}
          filter={statusFilter}
          onFilterChange={setStatusFilter}
          sort={sort}
          onSortChange={setSort}
          actions={
            <>
              <button
                type="button"
                onClick={() => {
                  void handleBulkApprove();
                }}
                disabled={Boolean(busyId) || pendingVisible.length === 0}
                className="h-10 shrink-0 rounded-xl border border-teal-200 px-3 text-xs font-semibold whitespace-nowrap text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                선택 항목 일괄 지급 처리
              </button>
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-zinc-200 px-3 text-xs font-semibold whitespace-nowrap text-zinc-700 hover:bg-zinc-50"
              >
                <Download className="size-3.5" aria-hidden />
                엑셀/CSV 다운로드
              </button>
            </>
          }
          extra={
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
          }
        />

      {filtered.length === 0 ? (
        <div className="p-4">
          <AdminEmptyState message="선택한 기간의 정산 내역이 없습니다." />
        </div>
      ) : (
        <div className="max-h-[70vh] w-full min-w-0 overflow-x-hidden overflow-y-auto">
            <table className="w-full min-w-0 table-fixed text-left text-xs leading-tight">
              <colgroup>
                <col className="w-[3%]" />
                <col className="w-[13%]" />
                <col className="w-[12%]" />
                <col className="w-[9%]" />
                <col className="w-[7%]" />
                <col className="w-[6%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
                <col className="w-[6%]" />
                <col className="w-[7%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">
                    <input
                      type="checkbox"
                      aria-label="지급 대기 전체 선택"
                      checked={allPendingSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedIds(pendingVisible.map((item) => item.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                    />
                  </th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">크리에이터</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">캠페인</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">처리 일시</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">공급가액</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">부가세</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">3.3% 공제액</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">최종 정산액</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">수수료(공제액)</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">실지급액</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">상태</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">관리</th>
                  <th className="overflow-hidden px-1 py-1.5 sm:px-2 font-medium">관리자 메모</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((payout) => {
                  const row = enrichPayout(payout);
                  const pending = row.status === 'pending';
                  const busy = busyId === payout.id || busyId === 'bulk';
                  const anyBusy = Boolean(busyId);

                  return (
                    <tr
                      key={payout.id}
                      className="border-b border-zinc-100 last:border-0"
                    >
                      <td className="overflow-hidden px-1 py-1.5 align-top sm:px-2">
                        {pending ? (
                          <input
                            type="checkbox"
                            aria-label={`${row.creatorName} 정산 선택`}
                            checked={selectedIds.includes(payout.id)}
                            onChange={(event) => {
                              setSelectedIds((prev) =>
                                event.target.checked
                                  ? [...prev, payout.id]
                                  : prev.filter((id) => id !== payout.id),
                              );
                            }}
                          />
                        ) : null}
                      </td>
                      <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 sm:px-2 align-top">
                        <p
                          className="min-w-0 max-w-[120px] truncate font-medium text-zinc-950"
                          title={row.creatorName || '이름 없음'}
                        >
                          {row.creatorName || '이름 없음'}
                        </p>
                        <AdminCopyText
                          value={row.creatorEmail || ''}
                          emptyLabel="이메일 없음"
                          className="mt-0.5 max-w-[120px]"
                        />
                        <AdminCopyText
                          value={row.bankAccount || ''}
                          emptyLabel="계좌 미등록"
                          className="mt-0.5 max-w-[120px]"
                        />
                      </td>
                      <td
                        data-col="campaign"
                        className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 sm:px-2 align-top text-zinc-600"
                      >
                        <span
                          className="block min-w-0 max-w-[120px] truncate"
                          title={row.auctionTitle || '연결된 캠페인 없음'}
                        >
                          {row.auctionTitle || '연결된 캠페인 없음'}
                        </span>
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top tabular-nums text-ellipsis whitespace-nowrap text-zinc-600">
                        {formatAdminTimestamp(row.paidAt || row.requestedAt)}
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top tabular-nums text-ellipsis whitespace-nowrap text-zinc-600">
                        {formatWon(row.supplyAmount ?? 0)}
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top tabular-nums text-ellipsis whitespace-nowrap text-zinc-600">
                        {formatWon(row.vatAmount ?? 0)}
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top tabular-nums text-ellipsis whitespace-nowrap text-zinc-600">
                        {formatWon(row.withholdingAmount ?? 0)}
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top font-medium tabular-nums text-ellipsis whitespace-nowrap text-zinc-950">
                        {formatWon(row.netPayoutAmount ?? row.amount)}
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top tabular-nums text-ellipsis whitespace-nowrap text-zinc-600">
                        {formatWon(row.platformFee ?? 0)}
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top font-medium tabular-nums text-ellipsis whitespace-nowrap text-zinc-950">
                        {formatWon(row.amount)}
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top">
                        <span
                          className={
                            pending
                              ? 'inline-block max-w-full truncate rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800'
                              : 'inline-block max-w-full truncate rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                          }
                        >
                          {STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top">
                        <div className="flex min-w-0 flex-col gap-1">
                          {pending ? (
                            <button
                              type="button"
                              disabled={anyBusy}
                              onClick={() => {
                                void handleApprove(payout);
                              }}
                              className="inline-flex w-full min-w-0 items-center justify-center gap-1 rounded-md border border-teal-200 px-1.5 py-0.5 text-[10px] font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                              {busy ? '처리 중...' : '지급 처리'}
                            </button>
                          ) : (
                            <span className="text-xs font-semibold text-zinc-400">지급 완료</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setTaxPayout(row)}
                            className="inline-flex w-full min-w-0 items-center justify-center rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 hover:bg-zinc-50"
                          >
                            세무 상세
                          </button>
                        </div>
                      </td>
                      <td className="min-w-0 overflow-hidden px-1 py-1.5 sm:px-2 align-top">
                        <div className="flex min-w-0 flex-col gap-1">
                          <input
                            value={memoDrafts[payout.id] ?? row.adminMemo ?? ''}
                            onChange={(event) =>
                              setMemoDrafts((prev) => ({ ...prev, [payout.id]: event.target.value }))
                            }
                            placeholder="내부 메모"
                            className="h-7 w-24 min-w-0 truncate rounded-md border border-zinc-200 px-1.5 text-xs outline-none focus:border-teal-600"
                          />
                          <button
                            type="button"
                            disabled={memoBusyId === payout.id}
                            onClick={() => {
                              void handleSaveMemo(payout);
                            }}
                            className="h-6 w-24 min-w-0 rounded-md border border-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                          >
                            {memoBusyId === payout.id ? '저장 중...' : '메모 저장'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
      )}
      </div>
      {taxPayout ? (
        <AdminPayoutTaxModal payout={taxPayout} onClose={() => setTaxPayout(null)} />
      ) : null}
    </div>
  );
}
