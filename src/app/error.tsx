'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[SponsorAuction] 페이지 오류', error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center overflow-x-clip px-4 py-12">
      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-rose-700">일시적인 오류</p>
        <h1 className="mt-2 text-xl font-bold text-zinc-950">페이지를 불러오지 못했습니다</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-600">
          네트워크 또는 서버 응답이 지연되었을 수 있습니다. 잠시 후 다시 시도해 주세요.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
          >
            다시 시도
          </button>
          <Link
            href="/"
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-zinc-200 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            홈으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}
