'use client';

import { useState } from 'react';
import {
  campaignHoldLedgerLabel,
  creditDealKindFromDescription,
} from '@/lib/campaign-credit';
import { PAYOUT_DEAL_KIND_LABEL } from '@/lib/timeslot-deal';
import { formatDateTime, formatWon } from '@/lib/utils';

export type CreditLedgerEntryRow = {
  type: 'CHARGE' | 'HOLD' | 'RELEASE' | 'REFUND';
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

const TYPE_LABEL: Record<CreditLedgerEntryRow['type'], string> = {
  CHARGE: '충전',
  HOLD: '이용',
  RELEASE: '해제',
  REFUND: '환불',
};

export function CreditLedgerEntry({ row }: { row: CreditLedgerEntryRow }) {
  const [open, setOpen] = useState(false);
  const dealKind = creditDealKindFromDescription(row.description);
  const typeLabel =
    row.type === 'HOLD' ? '예치' : row.type === 'RELEASE' ? '예치 해제' : TYPE_LABEL[row.type];
  const breakdown =
    row.type === 'HOLD' || row.type === 'RELEASE'
      ? campaignHoldLedgerLabel({
          type: row.type,
          amount: row.amount,
          description: row.description,
        })
      : row.type === 'REFUND'
        ? campaignHoldLedgerLabel({
            type: row.type,
            amount: row.amount,
            description: row.description,
          })
        : '';
  const memo = row.description?.trim() || '';
  const extraMemo = memo && memo !== breakdown ? memo : '';
  const hasDetail = Boolean(breakdown || extraMemo || row.reference_id);

  return (
    <li className="py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-zinc-950">
          {dealKind ? `${PAYOUT_DEAL_KIND_LABEL[dealKind]} · ` : ''}
          {typeLabel} {formatWon(row.amount)} · 잔액 {formatWon(row.balance_after)}
        </p>
        {hasDetail ? (
          <button
            type="button"
            className="shrink-0 whitespace-nowrap text-xs font-medium text-zinc-400 hover:text-zinc-700"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? '접기' : '상세 보기'}
          </button>
        ) : null}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">{formatDateTime(row.created_at)}</p>
      {open && hasDetail ? (
        <div className="mt-1 space-y-0.5 text-xs leading-5 text-zinc-500">
          {breakdown ? <p>{breakdown}</p> : null}
          {extraMemo ? <p className="break-all">{extraMemo}</p> : null}
          {row.reference_id ? <p className="break-all">{row.reference_id}</p> : null}
        </div>
      ) : null}
    </li>
  );
}
