'use client';

import { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { downloadCsv, sortByAdminList, type AdminListSort } from '@/lib/admin-csv';
import { formatAdminTimestamp } from '@/lib/utils';
import { businessVerificationLabel } from '@/lib/business-registration';
import type { ProfileAdminFilter, ProfileItem, ProfileStatus } from '@/types/admin';
import { isAdmin, memberPrimaryRoleLabel } from '@/types/auth';

const STATUS_LABEL: Record<ProfileStatus, string> = {
  active: '정상',
  suspended: '정지',
};

const FILTERS: { id: ProfileAdminFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '정상 회원' },
  { id: 'suspended', label: '정지 회원' },
];

function UserManageButtons({
  profile,
  busy,
  anyBusy,
  compact,
  onToggleStatus,
  onReviewBusiness,
}: {
  profile: ProfileItem;
  busy: boolean;
  anyBusy: boolean;
  compact?: boolean;
  onToggleStatus: (profile: ProfileItem) => void;
  onReviewBusiness?: (profile: ProfileItem, decision: 'approve' | 'reject') => void;
}) {
  const suspended = profile.status === 'suspended';
  const base = compact
    ? 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:opacity-50'
    : 'inline-flex min-h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50';
  const canReview =
    Boolean(profile.businessRegistrationNumber) &&
    profile.businessVerificationStatus &&
    profile.businessVerificationStatus !== 'unregistered' &&
    profile.businessVerificationStatus !== 'closed';
  return (
    <div className={compact ? 'flex flex-wrap gap-1' : 'flex flex-wrap gap-2'}>
      {canReview ? (
        <>
          <button
            type="button"
            disabled={anyBusy || profile.businessVerificationStatus === 'verified'}
            onClick={() => onReviewBusiness?.(profile, 'approve')}
            className={`${base} border border-zinc-200 text-zinc-700 hover:bg-zinc-50 disabled:opacity-40`}
          >
            승인
          </button>
          <button
            type="button"
            disabled={anyBusy || profile.businessVerificationStatus === 'rejected'}
            onClick={() => onReviewBusiness?.(profile, 'reject')}
            className={`${base} border border-rose-200 text-rose-700 hover:bg-rose-50 disabled:opacity-40`}
          >
            반려
          </button>
        </>
      ) : null}
      {isAdmin(profile) ? (
        <span className="text-xs text-zinc-400">권한 고정</span>
      ) : (
        <button
          type="button"
          disabled={anyBusy}
          onClick={() => onToggleStatus(profile)}
          className={
            suspended
              ? `${base} border border-clink-peach-strong text-clink-accent hover:bg-clink-peach`
              : `${base} border border-rose-200 text-rose-700 hover:bg-rose-50`
          }
        >
          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          {busy ? '처리 중...' : suspended ? '정지 해제' : '정지'}
        </button>
      )}
    </div>
  );
}

type AdminUserTableProps = {
  profiles: ProfileItem[];
  busyId: string | null;
  onToggleStatus: (profile: ProfileItem) => void;
  onReviewBusiness?: (profile: ProfileItem, decision: 'approve' | 'reject') => void;
};

export function AdminUserTable({
  profiles,
  busyId,
  onToggleStatus,
  onReviewBusiness,
}: AdminUserTableProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProfileAdminFilter>('all');
  const [sort, setSort] = useState<AdminListSort>('newest');

  const filtered = useMemo(() => {
    if (!Array.isArray(profiles)) {
      return [];
    }
    const keyword = query.trim().toLowerCase();
    const matched = profiles.filter((profile) => {
      if (filter !== 'all' && profile.status !== filter) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const name = (profile.name || '').toLowerCase();
      const email = (profile.email || '').toLowerCase();
      return name.includes(keyword) || email.includes(keyword);
    });
    return sortByAdminList(
      matched,
      sort,
      (profile) => profile.createdAt,
      () => 0,
    );
  }, [filter, profiles, query, sort]);

  if (!Array.isArray(profiles) || profiles.length === 0) {
    return <AdminEmptyState message="등록된 회원이 없습니다." />;
  }

  return (
    <div className="w-full min-w-0 rounded-2xl border border-zinc-200 bg-white">
      <AdminFilterBar
        query={query}
        onQueryChange={setQuery}
        placeholder="회원 이름, 이메일 검색"
        searchLabel="회원 검색"
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
                `users-${new Date().toISOString().slice(0, 10)}.csv`,
                ['이름', '이메일', '역할', '상태', '가입일시'],
                filtered.map((profile) => [
                  profile.name,
                  profile.email,
                  memberPrimaryRoleLabel(profile),
                  STATUS_LABEL[profile.status] ?? profile.status,
                  formatAdminTimestamp(profile.createdAt),
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
          <AdminEmptyState message="조건에 맞는 회원이 없습니다." />
        </div>
      ) : (
        <>
        <ul className="flex flex-col gap-3 p-3 pb-24 md:hidden">
          {filtered.map((profile) => {
            const suspended = profile.status === 'suspended';
            const busy = busyId === profile.id;
            const anyBusy = Boolean(busyId);
            return (
              <li key={profile.id} className="rounded-2xl border border-zinc-200 bg-white p-3">
                <p className="break-words text-sm font-semibold leading-5 text-zinc-950">
                  {profile.name || '이름 없음'}
                </p>
                <p className="mt-1 break-all text-sm text-zinc-600">{profile.email || '이메일 없음'}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="min-w-0">
                    <dt className="text-[11px] font-medium text-zinc-500">역할</dt>
                    <dd className="mt-0.5">
                      <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                        {memberPrimaryRoleLabel(profile)}
                      </span>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-medium text-zinc-500">가입일</dt>
                    <dd className="mt-0.5 break-words text-zinc-800">
                      {formatAdminTimestamp(profile.createdAt)}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-medium text-zinc-500">상태</dt>
                    <dd className="mt-0.5">
                      <span
                        className={
                          suspended
                            ? 'inline-flex rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700'
                            : 'inline-flex rounded-full bg-clink-peach px-2 py-1 text-xs font-semibold text-clink-accent'
                        }
                      >
                        {STATUS_LABEL[profile.status] ?? profile.status}
                      </span>
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-medium text-zinc-500">사업자 검증</dt>
                    <dd className="mt-0.5 break-words text-zinc-800">
                      {businessVerificationLabel(profile.businessVerificationStatus ?? 'unregistered')}
                      {profile.businessRegistrationNumber ? (
                        <span className="mt-0.5 block break-all text-xs text-zinc-500">
                          {profile.businessRegistrationNumber}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <UserManageButtons
                    profile={profile}
                    busy={busy}
                    anyBusy={anyBusy}
                    onToggleStatus={onToggleStatus}
                    onReviewBusiness={onReviewBusiness}
                  />
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden max-h-[70vh] w-full min-w-0 overflow-x-hidden overflow-y-auto md:block">
          <table className="w-full min-w-0 table-fixed text-left text-xs">
            <colgroup>
              <col className="w-1/3" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[21%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-1 py-1.5 sm:px-2 font-medium">이름/이메일</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">역할</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">가입일</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">상태</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((profile) => {
                const suspended = profile.status === 'suspended';
                const busy = busyId === profile.id;
                const anyBusy = Boolean(busyId);
                return (
                  <tr
                    key={profile.id}
                    className="border-b border-zinc-100 last:border-0"
                  >
                    <td className="min-w-0 max-w-[120px] overflow-hidden px-1 py-1.5 align-top sm:px-2">
                      <p
                        className="min-w-0 max-w-[120px] truncate font-medium text-zinc-950"
                        title={profile.name || '이름 없음'}
                      >
                        {profile.name || '이름 없음'}
                      </p>
                      <p
                        className="mt-0.5 min-w-0 max-w-[120px] truncate text-xs text-zinc-500"
                        title={profile.email || '이메일 없음'}
                      >
                        {profile.email || '이메일 없음'}
                      </p>
                      <p className="mt-1 text-[11px] text-zinc-500">
                        사업자 {businessVerificationLabel(profile.businessVerificationStatus ?? 'unregistered')}
                        {profile.businessRegistrationNumber
                          ? ` · ${profile.businessRegistrationNumber}`
                          : ''}
                      </p>
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top whitespace-nowrap text-zinc-600">
                      <span className="inline-flex max-w-full truncate rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                        {memberPrimaryRoleLabel(profile)}
                      </span>
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top whitespace-nowrap text-zinc-600">
                      {formatAdminTimestamp(profile.createdAt)}
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top">
                      <span
                        className={
                          suspended
                            ? 'rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700'
                            : 'rounded-full bg-clink-peach px-2 py-1 text-xs font-semibold text-clink-accent'
                        }
                      >
                        {STATUS_LABEL[profile.status] ?? profile.status}
                      </span>
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top">
                      <UserManageButtons
                        profile={profile}
                        busy={busy}
                        anyBusy={anyBusy}
                        compact
                        onToggleStatus={onToggleStatus}
                        onReviewBusiness={onReviewBusiness}
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
