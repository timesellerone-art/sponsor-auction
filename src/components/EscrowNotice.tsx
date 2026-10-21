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
        플랫폼 안전결제(에스크로)
      </p>
      {compact ? (
        <p className="mt-1 text-xs leading-5">
          계좌·카톡 등 직거래는 보호 대상이 아닙니다. 반드시 이 화면에서 결제해 주세요.
        </p>
      ) : (
        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-5">
          <li>낙찰 후 대금은 플랫폼이 보관(에스크로)하고, 결제 완료 시에만 계약이 확정됩니다.</li>
          <li>계좌이체·카톡·외부 링크 유도는 약관 위반이며 캠페인이 취소될 수 있습니다.</li>
          <li>결제 승인 후 세금계산서 발행이 자동 신청됩니다.</li>
        </ul>
      )}
    </div>
  );
}
