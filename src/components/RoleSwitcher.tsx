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
          'inline-flex h-[30px] w-[8.5rem] shrink-0 rounded-full border border-zinc-200 bg-zinc-50',
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
          'inline-flex shrink-0 whitespace-nowrap rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800',
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
        'inline-flex shrink-0 overflow-hidden whitespace-nowrap rounded-full border border-stone-200 bg-white p-0.5',
        className,
      )}
    >
      {switchableRoles.map((role) => {
        const selected = role === activeRole;
        const modeName = memberModeLabel(role);
        return (
          <button
            key={role}
            type="button"
            aria-label={modeName}
            aria-pressed={selected}
            onClick={() => handleSelect(role)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[11px] font-semibold transition-colors',
              selected
                ? 'bg-emerald-900 text-white'
                : 'text-stone-600 hover:text-stone-950',
            )}
          >
            {memberRoleLabel(role)}
          </button>
        );
      })}
    </div>
  );
}
