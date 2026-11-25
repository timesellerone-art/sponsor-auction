'use client';

import { useState } from 'react';
import { CreditLedgerEntry } from '@/components/CreditLedgerEntry';
import { formatWon } from '@/lib/utils';

type LedgerRow = {
  id: string;
  user_id: string;
  type: 'CHARGE' | 'HOLD' | 'RELEASE' | 'REFUND';
  amount: number;
  balance_after: number;
  reference_id: string | null;
  description: string | null;
  created_at: string;
};

function adminCreditRequest(input: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Cache-Control', 'no-store');
  return fetch(input, {
    ...init,
    credentials: 'include',
    cache: 'no-store',
    headers,
  });
}

export function AdminCreditLedger() {
  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState('1000');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (target = query) => {
    setBusy(true);
    setError(null);
    try {
      const response = await adminCreditRequest(
        `/api/admin/credits?q=${encodeURIComponent(target.trim())}`,
      );
      const body = (await response.json().catch(() => null)) as {
        data?: LedgerRow[];
        userId?: string | null;
        balance?: number | null;
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(body?.error || '원장을 불러오지 못했습니다.');
      }
      setRows(body?.data ?? []);
      setUserId(body?.userId ?? '');
      setBalance(typeof body?.balance === 'number' ? body.balance : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '원장을 불러오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const adjust = async (action: 'refund' | 'grant' | 'deduct') => {
    if (!userId) {
      setError('먼저 회원을 조회해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await adminCreditRequest('/api/admin/credits', {
        method: 'POST',
        body: JSON.stringify({
          userId,
          amount: Number(amount),
          action,
          description: note,
        }),
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(body?.error || '원장을 조정하지 못했습니다.');
      }
      await load(userId);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '원장을 조정하지 못했습니다.');
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-bold text-zinc-950">크레딧 원장</h2>
      <p className="mt-1 text-sm text-zinc-500">
        이메일 또는 회원 ID로 최근 100건을 보고, 환불·지급·차감을 원장에 남깁니다.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이메일 또는 회원 ID"
          className="h-10 min-w-64 flex-1 rounded-xl border border-zinc-200 px-3 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void load()}
          className="h-10 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          조회
        </button>
      </div>
      {userId ? (
        <p className="mt-3 text-sm text-zinc-700">
          잔액 {balance === null ? '—' : formatWon(balance)}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="numeric"
          className="h-10 w-32 rounded-xl border border-zinc-200 px-3 text-sm"
          aria-label="조정 금액"
        />
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="사유"
          className="h-10 min-w-40 flex-1 rounded-xl border border-zinc-200 px-3 text-sm"
        />
        <button type="button" disabled={busy} onClick={() => void adjust('refund')} className="h-10 rounded-full border border-zinc-200 px-3 text-xs font-semibold">
          환불
        </button>
        <button type="button" disabled={busy} onClick={() => void adjust('grant')} className="h-10 rounded-full border border-zinc-200 px-3 text-xs font-semibold">
          지급
        </button>
        <button type="button" disabled={busy} onClick={() => void adjust('deduct')} className="h-10 rounded-full border border-zinc-200 px-3 text-xs font-semibold">
          차감
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      <ul className="mt-3 max-h-96 divide-y divide-zinc-100 overflow-y-auto pr-1">
        {rows.map((row) => (
          <CreditLedgerEntry key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}
