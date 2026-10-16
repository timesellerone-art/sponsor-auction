'use client';

import { showToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

type AdminCopyTextProps = {
  value: string;
  emptyLabel: string;
  className?: string;
};

export function AdminCopyText({ value, emptyLabel, className }: AdminCopyTextProps) {
  const text = value.trim();
  if (!text) {
    return <span className={cn('text-xs text-zinc-400', className)}>{emptyLabel}</span>;
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast('클립보드에 복사했습니다.', 'success');
    } catch (error) {
      console.warn('[SponsorAuction] 클립보드 복사 실패', error);
      showToast('복사에 실패했습니다.');
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        void handleCopy();
      }}
      title={`${text} (클릭하여 복사)`}
      className={cn(
        'block min-w-0 max-w-full truncate text-left text-xs text-teal-800 underline-offset-2 hover:underline',
        className,
      )}
    >
      {text}
    </button>
  );
}
