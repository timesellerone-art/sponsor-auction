import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EscrowNotice({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950',
        className,
      )}
    >
      <p className="inline-flex items-center gap-1.5 text-xs font-semibold">
        <ShieldCheck className="size-3.5" aria-hidden />
        토스페이먼츠 단건 에스크로 결제
      </p>
      {compact ? (
        <p className="mt-1 text-xs leading-5">
          계좌·카톡 등 직거래는 보호 대상이 아닙니다. 반드시 이 화면에서 결제해 주세요.
        </p>
      ) : (
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5">
          <li>선정 후 사전 확정 금액 1건을 토스페이먼츠 단건 에스크로로 예치해야 계약이 확정됩니다.</li>
          <li>예치금은 납품 후 광고주 구매 확정 시 정산되며, 납품 전 취소는 환불·취소·에스크로 정책을 따릅니다.</li>
          <li>계좌이체·카톡·외부 링크 유도는 약관 위반이며 거래가 취소될 수 있습니다.</li>
          <li>검증된 사업자 거래는 결제 승인 후 세금계산서 발행이 신청될 수 있습니다.</li>
        </ul>
      )}
    </div>
  );
}
