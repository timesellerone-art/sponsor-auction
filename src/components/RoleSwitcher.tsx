'use client';

import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import {
  memberModeLabel,
  memberRoleLabel,
  type MemberRole,
} from '@/types/auth';

type RoleSwitcherProps = {
  className?: string;
};

export function RoleSwitcher({ className }: RoleSwitcherProps) {
  const { ready, user, activeRole, switchableRoles, setActiveRole } = useAuth();
  if (!user || switchableRoles.length === 0) {
    return null;
  }
  if (!ready || !activeRole) {
    return (
      <span
        className={cn(
          'inline-flex h-[30px] w-[12.5rem] shrink-0 rounded-full border border-zinc-200 bg-zinc-50',
          className,
        )}
        aria-hidden
      />
    );
  }

  if (switchableRoles.length === 1) {
    return (
      <span
        className={cn(
          'inline-flex max-w-[42vw] truncate rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold text-teal-800 sm:max-w-none',
          className,
        )}
      >
        {memberModeLabel(activeRole)}
      </span>
    );
  }

  const handleSelect = (role: MemberRole) => {
    if (role === activeRole) {
      return;
    }
    const switched = setActiveRole(role);
    if (switched) {
      showToast(`${memberModeLabel(role)}로 전환했습니다.`, 'success');
    }
  };

  return (
    <div
      role="group"
      aria-label="역할 전환"
      className={cn(
        'inline-flex max-w-full min-w-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 p-0.5',
        className,
      )}
    >
      {switchableRoles.map((role) => {
        const selected = role === activeRole;
        return (
          <button
            key={role}
            type="button"
            aria-pressed={selected}
            onClick={() => handleSelect(role)}
            className={cn(
              'min-w-0 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors',
              selected
                ? 'bg-teal-700 text-white'
                : 'text-zinc-600 hover:text-zinc-950',
            )}
          >
            {memberRoleLabel(role)} 모드
          </button>
        );
      })}
    </div>
  );
}
