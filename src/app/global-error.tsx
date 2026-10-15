'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[SponsorAuction] 앱 오류', error);
  }, [error]);

  return (
    <html lang="ko">
      <body className="flex min-h-full flex-col overflow-x-clip bg-zinc-50 font-sans text-zinc-900">
        <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center px-4 py-12">
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold text-rose-700">서버 오류</p>
            <h1 className="mt-2 text-xl font-bold text-zinc-950">서비스를 표시할 수 없습니다</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              예상하지 못한 오류가 발생했습니다. 새로고침 후에도 계속되면 잠시 후 다시 이용해 주세요.
            </p>
            <button
              type="button"
              onClick={reset}
              className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800"
            >
              다시 시도
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
