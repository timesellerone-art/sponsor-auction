import type { CreatorTaxKind } from '@/lib/business-registration';
import {
  ADVERTISER_FEE_PERCENT,
  VAT_PERCENT,
  WITHHOLDING_PERCENT,
  creatorFeePolicyCopy,
} from '@/lib/fee-policy';
import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import { formatWon } from '@/lib/utils';

export type FeeBreakdownRole = 'advertiser' | 'creator';

export type FeeBreakdownCardProps = {
  role: FeeBreakdownRole;
  amount: number;
  taxKind?: CreatorTaxKind;
};

export function FeeBreakdownCard({
  role,
  amount,
  taxKind = 'individual',
}: FeeBreakdownCardProps) {
  const amounts = describeSettlementAmounts(amount, taxKind);
  if (amounts.bidAmount <= 0) {
    return null;
  }

  if (role === 'advertiser') {
    return (
      <section
        className="rounded-2xl border border-clink bg-clink px-4 py-4 text-white"
        aria-label="광고주 수수료 비교"
      >
        <p className="text-[11px] font-semibold tracking-wide text-clink-peach">
          플랫폼 안전 직거래
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/60">낙찰 금액</dt>
            <dd className="font-medium tabular-nums text-white">{formatWon(amounts.bidAmount)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/60">광고주 수수료({ADVERTISER_FEE_PERCENT}%)</dt>
            <dd className="font-medium tabular-nums text-clink-peach">
              +{formatWon(amounts.advertiserFee)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/60">공급가액 (낙찰 + 수수료)</dt>
            <dd className="font-medium tabular-nums text-white">
              {formatWon(amounts.advertiserSupply)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/60">부가세({VAT_PERCENT}% 별도)</dt>
            <dd className="font-medium tabular-nums text-clink-peach">
              +{formatWon(amounts.advertiserVat)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-2">
            <dt className="font-semibold text-white">최종 결제 금액</dt>
            <dd className="text-base font-bold tabular-nums text-clink-peach">
              {formatWon(amounts.advertiserCharge)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs leading-5 text-clink-peach">
          낙찰 금액에 광고주 수수료 {ADVERTISER_FEE_PERCENT}%를 더한 공급가액에 부가세{' '}
          {VAT_PERCENT}%를 별도 가산합니다. 기존 대행사 마크업(25%)보다 낮은 고정 요율입니다.
        </p>
      </section>
    );
  }

  const isBusiness = taxKind === 'business';

  return (
    <section
      className="rounded-2xl border border-clink bg-clink px-4 py-4 text-white"
      aria-label="크리에이터 정산 비교"
    >
      <p className="text-[11px] font-semibold tracking-wide text-clink-peach">구간별 정산 안내</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/60">과업 낙찰 금액</dt>
          <dd className="font-medium tabular-nums text-white">{formatWon(amounts.bidAmount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/60">크리에이터 수수료({Math.round(amounts.creatorFeeRate * 100)}% 공제)</dt>
          <dd className="font-medium tabular-nums text-clink-peach">-{formatWon(amounts.creatorFee)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/60">수수료 공제 후</dt>
          <dd className="font-medium tabular-nums text-white">{formatWon(amounts.finalSettlement)}</dd>
        </div>
        {isBusiness ? (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/60">부가세({VAT_PERCENT}% 별도)</dt>
            <dd className="font-medium tabular-nums text-clink-peach">+{formatWon(amounts.vatAmount)}</dd>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/60">원천징수({WITHHOLDING_PERCENT}%)</dt>
            <dd className="font-medium tabular-nums text-clink-peach">
              -{formatWon(amounts.withholdingAmount)}
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-2">
          <dt className="font-semibold text-white">
            {isBusiness ? '실지급액 (VAT 가산)' : '실지급액'}
          </dt>
          <dd className="text-base font-bold tabular-nums text-clink-peach">
            {formatWon(amounts.transferAmount)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs leading-5 text-clink-peach">
        {creatorFeePolicyCopy()}.{' '}
        {isBusiness
          ? `사업자는 최종 정산액에 VAT ${VAT_PERCENT}% ${formatWon(amounts.vatAmount)}를 별도 가산합니다.`
          : `개인 프리랜서는 ${WITHHOLDING_PERCENT}% 원천징수 ${formatWon(amounts.withholdingAmount)}를 차감합니다.`}
      </p>
    </section>
  );
}
