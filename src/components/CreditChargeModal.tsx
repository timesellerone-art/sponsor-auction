'use client';

import { X } from 'lucide-react';
import { CreditWallet } from '@/components/CreditWallet';
import { formatWon } from '@/lib/utils';

export function CreditChargeModal({
  open,
  neededAmount,
  onClose,
}: {
  open: boolean;
  neededAmount: number;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credit-charge-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="credit-charge-title" className="text-base font-semibold text-zinc-950">
              크레딧 충전
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              낙찰 총 차감액(공급가액 + 부가세 10%)은 {formatWon(neededAmount)}입니다.
              충전 후 다시 낙찰해 주세요.
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
        <CreditWallet canCharge />
      </div>
    </div>
  );
}
