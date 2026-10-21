'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { COMPANY } from '@/lib/company';

export function SiteFooter() {
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setYear(new Date().getFullYear());
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <footer className="mt-auto w-full min-w-0 border-t border-zinc-200 bg-white">
      <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 text-xs text-zinc-500 sm:px-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1 leading-5">
            <p className="font-semibold text-zinc-700">
              {COMPANY.legalName} ({COMPANY.brand})
            </p>
            <p>대표 {COMPANY.ceo} · {COMPANY.address}</p>
            <p>{COMPANY.businessNo}</p>
            <p>{COMPANY.mailOrderNo}</p>
            <p>
              이메일{' '}
              <a href={`mailto:${COMPANY.email}`} className="hover:text-zinc-800 hover:underline">
                {COMPANY.email}
              </a>
            </p>
            <p>© {year ? `${year} ` : ''}{COMPANY.brand}</p>
          </div>
          <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="약관">
            <Link href="/terms" className="hover:text-zinc-800 hover:underline">
              서비스 이용약관
            </Link>
            <Link href="/privacy" className="hover:text-zinc-800 hover:underline">
              개인정보 처리방침
            </Link>
            <Link href="/refund" className="hover:text-zinc-800 hover:underline">
              취소 및 환불 규정
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
