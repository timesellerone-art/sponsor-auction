'use client';

import { X } from 'lucide-react';
import {
  ADVERTISER_FEE_PERCENT,
  VAT_PERCENT,
  WITHHOLDING_PERCENT,
} from '@/lib/fee-policy';
import { formatWon } from '@/lib/utils';
import type { PayoutItem } from '@/types/admin';

type AdminPayoutTaxModalProps = {
  payout: PayoutItem;
  onClose: () => void;
};

type TaxRow = { label: string; display: string };

export function AdminPayoutTaxModal({ payout, onClose }: AdminPayoutTaxModalProps) {
  const isBusiness = payout.taxKind === 'business';
  const taxKind = isBusiness ? '사업자(검증완료)' : '개인(미검증·원천징수)';
  const finalSettlement = payout.netPayoutAmount ?? payout.amount;
  const transfer =
    payout.transferAmount ??
    Math.max(0, finalSettlement - (payout.withholdingAmount ?? 0));
  const rows: TaxRow[] = [
    { label: '세무 구분', display: taxKind },
    {
      label: '낙찰 금액(공급가액)',
      display: formatWon(payout.bidAmount ?? payout.supplyAmount ?? 0),
    },
    {
      label: `광고주 결제 합계(수수료 ${ADVERTISER_FEE_PERCENT}% 합산)`,
      display: formatWon(payout.advertiserCharge ?? 0),
    },
    { label: '크리에이터 수수료(공제액)', display: formatWon(payout.platformFee ?? 0) },
    { label: '최종 정산액', display: formatWon(finalSettlement) },
    {
      label: isBusiness
        ? `원천징수(${WITHHOLDING_PERCENT}%, 검증 사업자 0원)`
        : `개인 원천징수(${WITHHOLDING_PERCENT}%)`,
      display: formatWon(payout.withholdingAmount ?? 0),
    },
    {
      label: isBusiness
        ? `부가세(${VAT_PERCENT}%, 최종 정산액 기준 별도)`
        : `부가세(${VAT_PERCENT}%, 개인 0원)`,
      display: formatWon(payout.vatAmount ?? 0),
    },
    { label: '실지급액(10원 절사)', display: formatWon(transfer) },
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
              <dd className="font-medium whitespace-nowrap text-zinc-950">{row.display}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
