'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Loader2 } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { downloadCsv, sortByAdminList, type AdminListSort } from '@/lib/admin-csv';
import { platformLabel } from '@/lib/platforms';
import {
  TIMESLOT_ADMIN_STATUS_CLASS,
  TIMESLOT_ADMIN_STATUS_LABEL,
  canForceCloseTimeslot,
  matchesTimeslotAdminFilter,
  timeslotAdminLifecycle,
  timeslotAdminStatusText,
} from '@/lib/timeslot-admin';
import { formatAdminTimestamp, formatWon } from '@/lib/utils';
import type { TimeslotAdminFilter } from '@/types/admin';
import type { TimeSlotItem } from '@/types/timeslot';

const FILTERS: { id: TimeslotAdminFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'open', label: '진행 중' },
  { id: 'awarded', label: '낙찰' },
  { id: 'delivered', label: '납품' },
  { id: 'confirmed', label: '구매확정' },
  { id: 'closed', label: '취소' },
  { id: 'blind', label: '숨김' },
];

type AdminTimeslotTableProps = {
  timeslots: TimeSlotItem[];
  busyId: string | null;
  onBlind: (slot: TimeSlotItem) => void;
  onUnblind: (slot: TimeSlotItem) => void;
  onClose: (slot: TimeSlotItem) => void;
};

function TimeslotManageButtons({
  slot,
  busy,
  anyBusy,
  compact,
  onBlind,
  onUnblind,
  onClose,
}: {
  slot: TimeSlotItem;
  busy: boolean;
  anyBusy: boolean;
  compact?: boolean;
  onBlind: (slot: TimeSlotItem) => void;
  onUnblind: (slot: TimeSlotItem) => void;
  onClose: (slot: TimeSlotItem) => void;
}) {
  const blinded = Boolean(slot.isBlind);
  const canClose = canForceCloseTimeslot(slot);
  const base = compact
    ? 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50'
    : 'inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50';
  return (
    <div className="flex flex-wrap gap-2">
      {blinded ? (
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => onUnblind(slot)}
          className={`${base} border border-clink-peach-strong text-clink-accent hover:bg-clink-peach`}
        >
          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          {busy ? '처리 중...' : '숨김 해제'}
        </button>
      ) : (
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => onBlind(slot)}
          className={`${base} border border-zinc-200 text-zinc-700 hover:bg-zinc-50`}
        >
          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          {busy ? '처리 중...' : '숨김 처리'}
        </button>
      )}
      <button
        type="button"
        disabled={anyBusy || !canClose}
        onClick={() => onClose(slot)}
        className={`${base} border border-rose-200 text-rose-700 hover:bg-rose-50`}
      >
        {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
        {busy ? '처리 중...' : canClose ? '강제 마감' : '마감 불가'}
      </button>
    </div>
  );
}

export function AdminTimeslotTable({
  timeslots,
  busyId,
  onBlind,
  onUnblind,
  onClose,
}: AdminTimeslotTableProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<TimeslotAdminFilter>('all');
  const [sort, setSort] = useState<AdminListSort>('newest');

  const filtered = useMemo(() => {
    if (!Array.isArray(timeslots)) {
      return [];
    }
    const keyword = query.trim().toLowerCase();
    const matched = timeslots.filter((slot) => {
      if (!matchesTimeslotAdminFilter(slot, filter)) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const title = (slot.title || '').toLowerCase();
      const creator = (slot.creatorName || '').toLowerCase();
      const description = (slot.description || '').toLowerCase();
      return title.includes(keyword) || creator.includes(keyword) || description.includes(keyword);
    });
    return sortByAdminList(
      matched,
      sort,
      (slot) => slot.createdAt,
      (slot) => slot.startingPrice,
    );
  }, [filter, query, sort, timeslots]);

  return (
    <div className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white">
      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="상품 제목, 등록 크리에이터 검색"
        searchLabel="크리에이터 상품 검색"
        filters={FILTERS}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        actions={
          <button
            type="button"
            onClick={() => {
              downloadCsv(
                `creator-products-${new Date().toISOString().slice(0, 10)}.csv`,
                ['제목', '등록 크리에이터', '플랫폼', '제안 건수', '상태', '시작가', '생성일시'],
                filtered.map((slot) => [
                  slot.title,
                  slot.creatorName,
                  platformLabel(slot.platform),
                  slot.bidsCount,
                  timeslotAdminStatusText(slot),
                  slot.startingPrice,
                  formatAdminTimestamp(slot.createdAt),
                ]),
              );
            }}
            className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl border border-zinc-200 px-3 text-xs font-semibold whitespace-nowrap text-zinc-700 hover:bg-zinc-50"
          >
            <Download className="size-3.5" aria-hidden />
            엑셀/CSV 다운로드
          </button>
        }
      />

      {filtered.length === 0 ? (
        <div className="p-4">
          <AdminEmptyState message="조건에 맞는 크리에이터 상품이 없습니다." />
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3 p-3 pb-24 md:hidden">
            {filtered.map((slot) => {
              const title = slot.title || '제목 없음';
              const lifecycle = timeslotAdminLifecycle(slot);
              const busy = busyId === slot.id;
              const anyBusy = Boolean(busyId);
              return (
                <li key={slot.id} className="rounded-2xl border border-zinc-200 bg-white p-3">
                  <Link
                    href={`/timeslots/${slot.id}`}
                    title={title}
                    className="block break-words text-sm font-semibold leading-5 text-zinc-950 hover:underline"
                  >
                    {title}
                  </Link>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-zinc-500">등록 크리에이터</dt>
                      <dd className="mt-0.5 break-words text-zinc-800">{slot.creatorName || '미상'}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-zinc-500">광고주 제안</dt>
                      <dd className="mt-0.5 break-all font-medium tabular-nums text-zinc-950">
                        {slot.bidsCount}건
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-zinc-500">상태</dt>
                      <dd className="mt-0.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${TIMESLOT_ADMIN_STATUS_CLASS[lifecycle]}`}
                        >
                          {timeslotAdminStatusText(slot)}
                        </span>
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-[11px] font-medium text-zinc-500">시작가</dt>
                      <dd className="mt-0.5 break-all font-medium tabular-nums text-zinc-950">
                        {formatWon(slot.startingPrice)}
                      </dd>
                    </div>
                  </dl>
                  <div className="mt-3">
                    <TimeslotManageButtons
                      slot={slot}
                      busy={busy}
                      anyBusy={anyBusy}
                      onBlind={onBlind}
                      onUnblind={onUnblind}
                      onClose={onClose}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden max-h-[70vh] w-full min-w-0 overflow-x-hidden overflow-y-auto md:block">
            <table className="w-full min-w-0 table-fixed text-left text-xs">
              <colgroup>
                <col className="w-[24%]" />
                <col className="w-[16%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
                <tr>
                  <th className="px-1 py-1.5 font-medium sm:px-2">제목</th>
                  <th className="px-1 py-1.5 font-medium sm:px-2">등록 크리에이터</th>
                  <th className="px-1 py-1.5 font-medium sm:px-2">플랫폼</th>
                  <th className="px-1 py-1.5 font-medium sm:px-2">제안 건수</th>
                  <th className="px-1 py-1.5 font-medium sm:px-2">상태</th>
                  <th className="px-1 py-1.5 font-medium sm:px-2">시작가</th>
                  <th className="px-1 py-1.5 font-medium sm:px-2">관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((slot) => {
                  const title = slot.title || '제목 없음';
                  const lifecycle = timeslotAdminLifecycle(slot);
                  const busy = busyId === slot.id;
                  const anyBusy = Boolean(busyId);
                  return (
                    <tr key={slot.id} className="border-b border-zinc-100 last:border-0">
                      <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 align-top text-ellipsis whitespace-nowrap sm:px-2">
                        <Link
                          href={`/timeslots/${slot.id}`}
                          title={title}
                          className="block min-w-0 max-w-[120px] truncate font-medium text-zinc-950 hover:underline"
                        >
                          {title}
                        </Link>
                      </td>
                      <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 align-top text-ellipsis whitespace-nowrap text-zinc-600 sm:px-2">
                        <span
                          className="block min-w-0 max-w-[120px] truncate"
                          title={slot.creatorName || '미상'}
                        >
                          {slot.creatorName || '미상'}
                        </span>
                      </td>
                      <td className="min-w-0 px-1 py-1.5 align-top whitespace-nowrap text-zinc-600 sm:px-2">
                        {platformLabel(slot.platform)}
                      </td>
                      <td className="min-w-0 px-1 py-1.5 align-top font-medium whitespace-nowrap tabular-nums text-zinc-950 sm:px-2">
                        {slot.bidsCount}건
                      </td>
                      <td className="min-w-0 px-1 py-1.5 align-top sm:px-2">
                        <span
                          className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${TIMESLOT_ADMIN_STATUS_CLASS[lifecycle]}`}
                          title={TIMESLOT_ADMIN_STATUS_LABEL[lifecycle]}
                        >
                          {timeslotAdminStatusText(slot)}
                        </span>
                      </td>
                      <td className="min-w-0 px-1 py-1.5 align-top font-medium whitespace-nowrap text-zinc-950 sm:px-2">
                        {formatWon(slot.startingPrice)}
                      </td>
                      <td className="min-w-0 px-1 py-1.5 align-top sm:px-2">
                        <TimeslotManageButtons
                          slot={slot}
                          busy={busy}
                          anyBusy={anyBusy}
                          compact
                          onBlind={onBlind}
                          onUnblind={onUnblind}
                          onClose={onClose}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
