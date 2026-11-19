'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

function FailFallback() {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
      <div className="h-40 animate-pulse rounded-2xl bg-white" />
    </div>
  );
}

function PaymentVerifyFailContent() {
  const params = useSearchParams();
  const message = params.get('message')?.trim() || params.get('code')?.trim() || '결제가 취소되었거나 실패했습니다.';

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-xl font-bold text-zinc-950">결제를 완료하지 못했습니다</h1>
      <p className="mt-2 text-sm text-zinc-600">{message}</p>
      <Link href="/payment-verify" className="mt-6 text-sm font-semibold text-clink-accent hover:underline">
        검수 페이지로 돌아가기
      </Link>
    </div>
  );
}

export default function PaymentVerifyFailPage() {
  return (
    <Suspense fallback={<FailFallback />}>
      <PaymentVerifyFailContent />
    </Suspense>
  );
}
