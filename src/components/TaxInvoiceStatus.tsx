'use client';

import { useEffect, useState } from 'react';
import { authRequestInit } from '@/lib/auth-request';

type TaxInvoiceState = {
  issued: boolean;
  status: 'issued' | 'fallback' | 'error' | 'none';
  label: string;
};

export function TaxInvoiceStatus({ auctionId }: { auctionId: string }) {
  const [state, setState] = useState<TaxInvoiceState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(
          `/api/campaigns/${encodeURIComponent(auctionId)}/tax-invoice`,
          await authRequestInit({ cache: 'no-store' }),
        );
        const body = (await response.json().catch(() => null)) as TaxInvoiceState | null;
        if (cancelled) {
          return;
        }
        if (!response.ok || !body) {
          setState({ issued: false, status: 'none', label: '미발행' });
          return;
        }
        setState({
          issued: Boolean(body.issued),
          status: body.status || 'none',
          label: body.label || '미발행',
        });
      } catch {
        if (!cancelled) {
          setState({ issued: false, status: 'none', label: '미발행' });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [auctionId]);

  const label = state?.label || '확인 중';
  const issued = state?.issued === true;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 sm:px-5">
      <p className="text-xs font-semibold tracking-wide text-clink-accent">세금계산서</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-800">발행 여부</p>
        <span
          className={
            issued
              ? 'rounded-full bg-clink-peach px-2.5 py-1 text-xs font-semibold text-clink'
              : 'rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600'
          }
        >
          {label}
        </span>
      </div>
    </section>
  );
}
