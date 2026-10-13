'use client';

import { Loader2 } from 'lucide-react';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { formatDate } from '@/lib/utils';
import type { ProfileItem, ProfileRole, ProfileStatus } from '@/types/admin';

const ROLE_LABEL: Record<ProfileRole, string> = {
  advertiser: '광고주',
  creator: '크리에이터',
  admin: '관리자',
};

const STATUS_LABEL: Record<ProfileStatus, string> = {
  active: '정상',
  suspended: '정지',
};

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
  if (!Array.isArray(profiles) || profiles.length === 0) {
    return <AdminEmptyState message="등록된 회원이 없습니다." />;
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="max-h-[70vh] overflow-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50 text-xs text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">이름/이메일</th>
              <th className="px-4 py-3 font-medium">역할</th>
              <th className="px-4 py-3 font-medium">가입일</th>
              <th className="px-4 py-3 font-medium">상태</th>
              <th className="px-4 py-3 font-medium">관리</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const suspended = profile.status === 'suspended';
              const busy = busyId === profile.id;
              const anyBusy = Boolean(busyId);
              const role = profile.role ?? 'advertiser';

              return (
                <tr
                  key={profile.id}
                  className="border-b border-zinc-100 last:border-0"
                >
                  <td className="max-w-[260px] px-4 py-3">
                    <p className="font-medium text-zinc-950">
                      {profile.name || '이름 없음'}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">
                      {profile.email || '이메일 없음'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {ROLE_LABEL[role] ?? role}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {formatDate(profile.createdAt)}
                  </td>
                  <td className="px-4 py-3">
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
                  <td className="px-4 py-3">
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
    </div>
  );
}
