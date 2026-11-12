'use client';

import { LANDING_ROLE_TABS } from '@/components/home/landing-audience';
import { useLandingAudience } from '@/components/home/LandingAudienceProvider';
import { cn } from '@/lib/utils';

type LandingRoleToggleProps = {
  className?: string;
};

export function LandingRoleToggle({ className }: LandingRoleToggleProps) {
  const { audience, setAudience } = useLandingAudience();

  return (
    <div
      role="tablist"
      aria-label="역할별 소개"
      className={cn(
        'inline-flex max-w-full items-center rounded-full bg-white p-1 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-stone-900/5',
        className,
      )}
    >
      {LANDING_ROLE_TABS.map((tab) => {
        const selected = audience === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setAudience(tab.id)}
            className={cn(
              'shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-semibold transition-colors sm:px-5 sm:text-sm',
              selected
                ? tab.id === 'creator'
                  ? 'bg-[#EA580C] text-white shadow-sm'
                  : 'bg-[#1C1917] text-white shadow-sm'
                : 'text-[#78716C] hover:text-[#1C1917]',
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
