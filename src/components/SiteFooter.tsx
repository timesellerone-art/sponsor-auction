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
    <footer className="mt-auto w-full min-w-0 border-t border-stone-200/80 bg-[#FAF8F5]">
      <div className="flex w-full min-w-0 flex-col gap-4 px-4 py-5 text-xs text-zinc-500 sm:px-6">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1 leading-5">
            <p className="font-semibold text-zinc-700">
              상호명: {COMPANY.legalName} ({COMPANY.brand})
            </p>
            <p>대표자: {COMPANY.ceo}</p>
            <p>사업자등록번호: {COMPANY.businessNo}</p>
            <p>통신판매업신고번호: {COMPANY.mailOrderNo}</p>
            <p>
              고객센터:{' '}
              <a href={`tel:${COMPANY.phone}`} className="hover:text-zinc-800 hover:underline">
                {COMPANY.phone}
              </a>{' '}
              ({COMPANY.phoneHours})
            </p>
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
              이용약관
            </Link>
            <Link href="/privacy" className="hover:text-zinc-800 hover:underline">
              개인정보처리방침
            </Link>
            <Link href="/refund" className="hover:text-zinc-800 hover:underline">
              환불 및 취소 규정
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
