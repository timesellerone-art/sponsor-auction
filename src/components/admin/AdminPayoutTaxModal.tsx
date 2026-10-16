'use client';

import { X } from 'lucide-react';
import { formatWon } from '@/lib/utils';
import type { PayoutItem } from '@/types/admin';

type AdminPayoutTaxModalProps = {
  payout: PayoutItem;
  onClose: () => void;
};

export function AdminPayoutTaxModal({ payout, onClose }: AdminPayoutTaxModalProps) {
  const rows = [
    { label: '낙찰(공급) 금액', value: payout.bidAmount ?? 0 },
    { label: '공급가액', value: payout.supplyAmount ?? 0 },
    { label: '부가세(10%)', value: payout.vatAmount ?? 0 },
    { label: '광고주 결제 합계', value: payout.advertiserCharge ?? 0 },
    { label: '플랫폼 수수료', value: payout.platformFee ?? 0 },
    { label: '3.3% 공제액', value: payout.withholdingAmount ?? 0 },
    { label: '최종 실지급액', value: payout.netPayoutAmount ?? payout.amount },
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payout-tax-title"
        className="w-full max-w-md min-w-0 overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 px-4 py-3">
          <div className="min-w-0">
            <h2 id="payout-tax-title" className="text-base font-semibold text-zinc-950">
              세무 내역
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {payout.creatorName} · {payout.auctionTitle}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100"
            aria-label="닫기"
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>
        <dl className="space-y-2 px-4 py-4 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <dt className="text-zinc-500">{row.label}</dt>
              <dd className="font-medium whitespace-nowrap text-zinc-950">{formatWon(row.value)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
