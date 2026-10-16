'use client';

import { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { downloadCsv, sortByAdminList, type AdminListSort } from '@/lib/admin-csv';
import { formatAdminTimestamp } from '@/lib/utils';
import type { ProfileAdminFilter, ProfileItem, ProfileRole, ProfileStatus } from '@/types/admin';

const ROLE_LABEL: Record<ProfileRole, string> = {
  advertiser: '광고주',
  creator: '크리에이터',
  admin: '관리자',
};

const STATUS_LABEL: Record<ProfileStatus, string> = {
  active: '정상',
  suspended: '정지',
};

const FILTERS: { id: ProfileAdminFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'active', label: '정상 회원' },
  { id: 'suspended', label: '정지 회원' },
];

type AdminUserTableProps = {
  profiles: ProfileItem[];
  busyId: string | null;
  onToggleStatus: (profile: ProfileItem) => void;
};

export function AdminUserTable({
  profiles,
  busyId,
  onToggleStatus,
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
                  ROLE_LABEL[profile.role] ?? profile.role,
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
        <div className="max-h-[70vh] w-full min-w-0 overflow-x-auto overflow-y-auto lg:overflow-x-hidden">
          <table className="w-full min-w-[560px] table-fixed text-left text-xs sm:text-sm lg:min-w-0">
            <colgroup>
              <col className="w-1/3" />
              <col className="w-[14%]" />
              <col className="w-[18%]" />
              <col className="w-[14%]" />
              <col className="w-[21%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-2 py-2 sm:px-3 font-medium">이름/이메일</th>
                <th className="px-2 py-2 sm:px-3 font-medium">역할</th>
                <th className="px-2 py-2 sm:px-3 font-medium">가입일</th>
                <th className="px-2 py-2 sm:px-3 font-medium">상태</th>
                <th className="px-2 py-2 sm:px-3 font-medium">관리</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((profile) => {
                const suspended = profile.status === 'suspended';
                const busy = busyId === profile.id;
                const anyBusy = Boolean(busyId);
                const role = profile.role ?? 'advertiser';

                return (
                  <tr
                    key={profile.id}
                    className="border-b border-zinc-100 last:border-0"
                  >
                    <td className="min-w-0 max-w-[300px] overflow-hidden px-2 py-2 sm:px-3 align-top">
                      <p
                        className="min-w-0 overflow-hidden font-medium text-ellipsis whitespace-nowrap text-zinc-950"
                        title={profile.name || '이름 없음'}
                      >
                        {profile.name || '이름 없음'}
                      </p>
                      <p
                        className="mt-0.5 min-w-0 overflow-hidden text-xs text-ellipsis whitespace-nowrap text-zinc-500"
                        title={profile.email || '이메일 없음'}
                      >
                        {profile.email || '이메일 없음'}
                      </p>
                    </td>
                    <td className="min-w-0 px-2 py-2 sm:px-3 align-top whitespace-nowrap text-zinc-600">
                      {ROLE_LABEL[role] ?? role}
                    </td>
                    <td className="min-w-0 px-2 py-2 sm:px-3 align-top whitespace-nowrap text-zinc-600">
                      {formatAdminTimestamp(profile.createdAt)}
                    </td>
                    <td className="min-w-0 px-2 py-2 sm:px-3 align-top">
                      <span
                        className={
                          suspended
                            ? 'rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700'
                            : 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800'
                        }
                      >
                        {STATUS_LABEL[profile.status] ?? profile.status}
                      </span>
                    </td>
                    <td className="min-w-0 px-2 py-2 sm:px-3 align-top">
                      {role === 'admin' ? (
                        <span className="text-xs text-zinc-400">권한 고정</span>
                      ) : (
                        <button
                          type="button"
                          disabled={anyBusy}
                          onClick={() => onToggleStatus(profile)}
                          className={
                            suspended
                              ? 'inline-flex items-center gap-1 rounded-full border border-teal-200 px-3 py-1 text-xs font-semibold text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50'
                              : 'inline-flex items-center gap-1 rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50'
                          }
                        >
                          {busy ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
                          {busy ? '처리 중...' : suspended ? '정지 해제' : '정지'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
