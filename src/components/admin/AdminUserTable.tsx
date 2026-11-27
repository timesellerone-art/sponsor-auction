'use client';

import { useMemo, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AdminFilterBar } from '@/components/admin/AdminFilterBar';
import { downloadCsv, sortByAdminList, type AdminListSort } from '@/lib/admin-csv';
import { formatAdminTimestamp } from '@/lib/utils';
import {
  businessVerificationLabel,
  type BusinessVerificationStatus,
} from '@/lib/business-registration';
import type { ProfileAdminFilter, ProfileItem, ProfileStatus } from '@/types/admin';
import {
  isAdmin,
  isCreator,
  memberRoleLabel,
  memberRolesLabel,
  parseAuthRoles,
  type AuthProfileRole,
} from '@/types/auth';

const STATUS_LABEL: Record<ProfileStatus, string> = {
  active: '정상',
  suspended: '정지',
};

const FILTER_ORDER: ProfileAdminFilter[] = [
  'all',
  'active',
  'suspended',
  'verified',
  'unverified',
  'creator',
];

const FILTER_NAME: Record<ProfileAdminFilter, string> = {
  all: '전체',
  active: '정상 회원',
  suspended: '정지 회원',
  verified: '사업자 인증 회원',
  unverified: '사업자 미인증 회원',
  creator: '크리에이터 회원',
};

function profileBusinessStatus(profile: ProfileItem): BusinessVerificationStatus {
  return profile.businessVerificationStatus ?? 'unregistered';
}

function isUnverifiedBusinessStatus(status: BusinessVerificationStatus) {
  return (
    status === 'unregistered' ||
    status === 'review_required' ||
    status === 'rejected' ||
    status === 'closed'
  );
}

function matchesProfileFilter(profile: ProfileItem, filter: ProfileAdminFilter) {
  if (filter === 'all') {
    return true;
  }
  if (filter === 'active' || filter === 'suspended') {
    return profile.status === filter;
  }
  if (filter === 'verified') {
    return profileBusinessStatus(profile) === 'verified';
  }
  if (filter === 'unverified') {
    return isUnverifiedBusinessStatus(profileBusinessStatus(profile));
  }
  return isCreator(profile);
}

function matchesKeyword(profile: ProfileItem, keyword: string) {
  if (!keyword) {
    return true;
  }
  const name = (profile.name || '').toLowerCase();
  const email = (profile.email || '').toLowerCase();
  return name.includes(keyword) || email.includes(keyword);
}

function roleBadgeClass(role: AuthProfileRole) {
  if (role === 'admin') {
    return 'inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700';
  }
  if (role === 'creator') {
    return 'inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800';
  }
  return 'inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900';
}

function RoleBadges({ profile }: { profile: ProfileItem }) {
  const roles = parseAuthRoles(profile);
  if (roles.length === 0) {
    return (
      <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
        역할 미설정
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role) => (
        <span key={role} className={roleBadgeClass(role)}>
          {memberRoleLabel(role)}
        </span>
      ))}
    </div>
  );
}

function businessStatusClass(status: BusinessVerificationStatus) {
  if (status === 'verified') {
    return 'inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800';
  }
  if (status === 'review_required') {
    return 'inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-900';
  }
  if (status === 'rejected' || status === 'closed') {
    return 'inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700';
  }
  return 'inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700';
}

function BusinessStatusBlock({ profile }: { profile: ProfileItem }) {
  const status = profileBusinessStatus(profile);
  const label = status === 'unregistered' ? '사업자 미등록' : businessVerificationLabel(status);
  const number = profile.businessRegistrationNumber?.trim() || '';
  const representative = profile.businessRepresentativeName?.trim() || '';
  return (
    <div className="min-w-0">
      <span className={businessStatusClass(status)}>{label}</span>
      {number ? (
        <p className="mt-1 break-all text-[11px] leading-4 text-zinc-600" title={number}>
          {number}
          {representative ? ` · ${representative}` : ''}
        </p>
      ) : status === 'verified' ? (
        <p className="mt-1 text-[11px] leading-4 text-zinc-500">사업자번호 없음</p>
      ) : null}
    </div>
  );
}

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

  const keyword = query.trim().toLowerCase();
  const searched = useMemo(() => {
    if (!Array.isArray(profiles)) {
      return [];
    }
    return profiles.filter((profile) => matchesKeyword(profile, keyword));
  }, [keyword, profiles]);

  const filterCounts = useMemo(() => {
    const counts = {
      all: searched.length,
      active: 0,
      suspended: 0,
      verified: 0,
      unverified: 0,
      creator: 0,
    };
    for (const profile of searched) {
      if (profile.status === 'active') {
        counts.active += 1;
      }
      if (profile.status === 'suspended') {
        counts.suspended += 1;
      }
      if (matchesProfileFilter(profile, 'verified')) {
        counts.verified += 1;
      }
      if (matchesProfileFilter(profile, 'unverified')) {
        counts.unverified += 1;
      }
      if (matchesProfileFilter(profile, 'creator')) {
        counts.creator += 1;
      }
    }
    return counts;
  }, [searched]);

  const filters = FILTER_ORDER.map((id) => ({
    id,
    label: `${FILTER_NAME[id]} (${filterCounts[id]})`,
  }));

  const filtered = useMemo(() => {
    const matched = searched.filter((profile) => matchesProfileFilter(profile, filter));
    return sortByAdminList(
      matched,
      sort,
      (profile) => profile.createdAt,
      () => 0,
    );
  }, [filter, searched, sort]);

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
        filters={filters}
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
                ['이름', '이메일', '역할', '상태', '사업자인증', '사업자등록번호', '가입일시'],
                filtered.map((profile) => [
                  profile.name,
                  profile.email,
                  memberRolesLabel(profile),
                  STATUS_LABEL[profile.status] ?? profile.status,
                  profileBusinessStatus(profile) === 'unregistered'
                    ? '사업자 미등록'
                    : businessVerificationLabel(profileBusinessStatus(profile)),
                  profile.businessRegistrationNumber || '',
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
                      <RoleBadges profile={profile} />
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
                    <dt className="text-[11px] font-medium text-zinc-500">사업자 인증</dt>
                    <dd className="mt-0.5">
                      <BusinessStatusBlock profile={profile} />
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
              <col className="w-[26%]" />
              <col className="w-[14%]" />
              <col className="w-[20%]" />
              <col className="w-[14%]" />
              <col className="w-[10%]" />
              <col className="w-[16%]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
              <tr>
                <th className="px-1 py-1.5 sm:px-2 font-medium">이름/이메일</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">역할</th>
                <th className="px-1 py-1.5 sm:px-2 font-medium">사업자 인증</th>
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
                    <td className="min-w-0 overflow-hidden px-1 py-1.5 align-top sm:px-2">
                      <p
                        className="min-w-0 truncate font-medium text-zinc-950"
                        title={profile.name || '이름 없음'}
                      >
                        {profile.name || '이름 없음'}
                      </p>
                      <p
                        className="mt-0.5 min-w-0 truncate text-xs text-zinc-500"
                        title={profile.email || '이메일 없음'}
                      >
                        {profile.email || '이메일 없음'}
                      </p>
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top">
                      <RoleBadges profile={profile} />
                    </td>
                    <td className="min-w-0 px-1 py-1.5 sm:px-2 align-top">
                      <BusinessStatusBlock profile={profile} />
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
