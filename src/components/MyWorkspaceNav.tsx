'use client';

import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { cn } from '@/lib/utils';

type MyWorkspaceTab = 'dashboard' | 'credits' | 'settings';

export function MyWorkspaceNav({ current }: { current: MyWorkspaceTab }) {
  const { activeRole } = useAuth();
  const tabs: Array<{ id: MyWorkspaceTab; href: string; label: string }> = [
    {
      id: 'dashboard',
      href: '/my',
      label: activeRole === 'creator' ? '내 제안' : '내 캠페인',
    },
    ...(activeRole === 'advertiser'
      ? [{ id: 'credits' as const, href: '/my/credits', label: '크레딧' }]
      : []),
    { id: 'settings', href: '/my/settings', label: '계정 설정' },
  ];

  return (
    <nav
      aria-label="마이페이지 메뉴"
      className="flex w-full min-w-0 flex-wrap items-center gap-2"
    >
      {tabs.map((tab) => {
        const active = tab.id === current;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 items-center rounded-full px-3.5 text-sm font-semibold transition-colors',
              active
                ? 'bg-zinc-950 text-white'
                : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
