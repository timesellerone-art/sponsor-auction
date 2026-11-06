import {
  ADVERTISER_FEE_RATE,
  CREATOR_FEE_RATE,
  advertiserFeeFromBid,
  advertiserPayableAmount,
  creatorPayoutAmount,
} from '@/lib/fees';
import { creatorCombinedFeeAmount } from '@/lib/payments/payout';
import { formatWon } from '@/lib/utils';

export type FeeBreakdownRole = 'advertiser' | 'creator';

export type FeeBreakdownCardProps = {
  role: FeeBreakdownRole;
  amount: number;
};

function asWon(value: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 0;
  }
  return Math.round(value);
}

export function FeeBreakdownCard({ role, amount }: FeeBreakdownCardProps) {
  const bidAmount = asWon(amount);
  if (bidAmount <= 0) {
    return null;
  }

  if (role === 'advertiser') {
    const platformFee = advertiserFeeFromBid(bidAmount);
    const payable = advertiserPayableAmount(bidAmount);
    return (
      <section
        className="rounded-2xl border border-emerald-800/40 bg-zinc-950 px-4 py-4 text-zinc-100"
        aria-label="광고주 수수료 비교"
      >
        <p className="text-[11px] font-semibold tracking-wide text-emerald-300">
          플랫폼 안전 직거래
        </p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-400">낙찰 금액</dt>
            <dd className="font-medium tabular-nums text-zinc-100">{formatWon(bidAmount)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-zinc-400">플랫폼 수수료({Math.round(ADVERTISER_FEE_RATE * 100)}%)</dt>
            <dd className="font-medium tabular-nums text-emerald-300">+{formatWon(platformFee)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-2">
            <dt className="font-semibold text-zinc-50">최종 결제 금액</dt>
            <dd className="text-base font-bold tabular-nums text-emerald-400">{formatWon(payable)}</dd>
          </div>
        </dl>
        <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-200">
          기존 광고 대행사(마크업 25%) 대비 약 15% 절감
        </p>
      </section>
    );
  }

  const combinedFee = creatorCombinedFeeAmount(bidAmount);
  const netPayout = creatorPayoutAmount(bidAmount);
  return (
    <section
      className="rounded-2xl border border-emerald-800/40 bg-zinc-950 px-4 py-4 text-zinc-100"
      aria-label="크리에이터 정산 비교"
    >
      <p className="text-[11px] font-semibold tracking-wide text-emerald-300">통합 정산 안내</p>
      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-zinc-400">과업 낙찰 금액</dt>
          <dd className="font-medium tabular-nums text-zinc-100">{formatWon(bidAmount)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-zinc-400">
            통합 수수료({Math.round(CREATOR_FEE_RATE * 100)}% 공제)
          </dt>
          <dd className="font-medium tabular-nums text-rose-300">-{formatWon(combinedFee)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 pt-2">
          <dt className="font-semibold text-zinc-50">최종 입금액</dt>
          <dd className="text-base font-bold tabular-nums text-emerald-400">{formatWon(netPayout)}</dd>
        </div>
      </dl>
      <p className="mt-3 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-200">
        타 플랫폼/MCN(평균 50% 공제) 대비 추가 정산
      </p>
    </section>
  );
}
