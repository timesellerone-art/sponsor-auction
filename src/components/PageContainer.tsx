import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 일반 유저 페이지 가독용 폭. /admin 레이아웃에서는 사용하지 않습니다. */
export function PageContainer({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={cn('mx-auto w-full max-w-6xl min-w-0 px-4 sm:px-6', className)}
    >
      {children}
    </div>
  );
}
