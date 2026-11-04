import Link from 'next/link';
import { cn } from '@/lib/utils';

type MyWorkspaceTab = 'dashboard' | 'settings';

const TABS: Array<{ id: MyWorkspaceTab; href: string; label: string }> = [
  { id: 'dashboard', href: '/my', label: '마이페이지' },
  { id: 'settings', href: '/my/settings', label: '계정 설정' },
];

export function MyWorkspaceNav({ current }: { current: MyWorkspaceTab }) {
  return (
    <nav
      aria-label="마이페이지 메뉴"
      className="flex w-full min-w-0 flex-wrap items-center gap-2"
    >
      {TABS.map((tab) => {
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
