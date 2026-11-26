'use client';

import Link from 'next/link';
import {
  SETTLEMENT_ACCOUNT_SETTINGS_HREF,
  formatSettlementAccountSummary,
  type SettlementType,
} from '@/lib/settlement-account';
import { cn } from '@/lib/utils';

type SettlementAccountSummaryProps = {
  settlementType: SettlementType;
  bankName: string;
  accountNumber: string;
  missing: boolean;
};

export function SettlementAccountSummary({
  settlementType,
  bankName,
  accountNumber,
  missing,
}: SettlementAccountSummaryProps) {
  const line = formatSettlementAccountSummary({
    settlementType,
    bankName,
    accountNumber,
    registered: !missing,
  });

  return (
    <section
      className={cn(
        'mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3',
        missing
          ? 'border-amber-200 bg-amber-50'
          : 'border-zinc-200 bg-white',
      )}
      aria-label="정산 계좌 요약"
    >
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold tracking-wide text-zinc-500">정산 계좌</p>
        <p
          className={cn(
            'mt-0.5 truncate text-sm',
            missing ? 'text-amber-900' : 'text-zinc-800',
          )}
        >
          {line}
        </p>
      </div>
      <Link
        href={SETTLEMENT_ACCOUNT_SETTINGS_HREF}
        className={cn(
          'inline-flex h-9 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold',
          missing
            ? 'bg-clink text-white hover:bg-stone-800'
            : 'border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50',
        )}
      >
        {missing ? '계정 설정에서 등록' : '계정 설정에서 변경'}
      </Link>
    </section>
  );
}
