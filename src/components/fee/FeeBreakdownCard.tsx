import {
  ADVERTISER_FEE_PERCENT,
  VAT_PERCENT,
  WITHHOLDING_PERCENT,
  creatorFeePolicyCopy,
  describeFeeQuote,
} from '@/lib/fee-policy';
import { formatWon } from '@/lib/utils';

export type FeeBreakdownRole = 'advertiser' | 'creator';

export type FeeBreakdownCardProps = {
  role: FeeBreakdownRole;
  amount: number;
};

export function FeeBreakdownCard({ role, amount }: FeeBreakdownCardProps) {
  const quote = describeFeeQuote(amount);
  if (quote.amount <= 0) {
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
            <dd className="font-medium tabular-nums text-white">{formatWon(quote.amount)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-white/60">광고주 수수료({ADVERTISER_FEE_PERCENT}%)</dt>
            <dd className="font-medium tabular-nums text-clink-peach">+{formatWon(quote.advertiserFee)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-2">
            <dt className="font-semibold text-white">최종 결제 금액</dt>
            <dd className="text-base font-bold tabular-nums text-clink-peach">
              {formatWon(quote.advertiserPayable)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs leading-5 text-clink-peach">
          낙찰 금액에 광고주 수수료 {ADVERTISER_FEE_PERCENT}%를 합산해 결제합니다. 기존 대행사
          마크업(25%)보다 낮은 고정 요율입니다.
        </p>
      </section>
    );
  }

  return (
    <section
      className="rounded-2xl border border-clink bg-clink px-4 py-4 text-white"
      aria-label="크리에이터 정산 비교"
    >
      <p className="text-[11px] font-semibold tracking-wide text-clink-peach">구간별 정산 안내</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/60">과업 낙찰 금액</dt>
          <dd className="font-medium tabular-nums text-white">{formatWon(quote.amount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-white/60">크리에이터 수수료({quote.creatorRatePercent}% 공제)</dt>
          <dd className="font-medium tabular-nums text-clink-peach">-{formatWon(quote.creatorFee)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-white/15 pt-2">
          <dt className="font-semibold text-white">수수료 공제 후</dt>
          <dd className="text-base font-bold tabular-nums text-clink-peach">
            {formatWon(quote.creatorPayout)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-xs leading-5 text-clink-peach">
        {creatorFeePolicyCopy()}. 개인은 {WITHHOLDING_PERCENT}% 원천징수{' '}
        {formatWon(quote.individualWithholding)}, 사업자는 VAT {VAT_PERCENT}% 별도입니다.
      </p>
    </section>
  );
}
