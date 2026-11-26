'use client';

import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { CreditLedgerEntry } from '@/components/CreditLedgerEntry';
import {
  campaignHoldLedgerLabel,
  creditDealKindFromDescription,
} from '@/lib/campaign-credit';
import { PAYOUT_DEAL_KIND_LABEL } from '@/lib/timeslot-deal';
import { authRequestInit } from '@/lib/auth-request';
import { formatDateTime, formatWon } from '@/lib/utils';

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

export function AdminCreditLedger() {
  const { user, ready } = useAuth();
  const [query, setQuery] = useState('');
  const [userId, setUserId] = useState('');
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [amount, setAmount] = useState('1000');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canRequest = ready && Boolean(user);

  const load = async (target = query) => {
    if (!canRequest) {
      setError('크레딧 원장을 보려면 로그인해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/admin/credits?q=${encodeURIComponent(target.trim())}`,
        await authRequestInit({
          method: 'GET',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store',
          },
        }),
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
    if (!canRequest) {
      setError('크레딧을 조정하려면 로그인해 주세요.');
      return;
    }
    if (!userId) {
      setError('먼저 회원을 조회해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        '/api/admin/credits',
        await authRequestInit({
          method: 'POST',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-store',
          },
          body: JSON.stringify({
            userId,
            amount: Number(amount),
            action,
            description: note,
          }),
        }),
      );
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
        이메일 또는 회원 ID로 최근 100건을 보고, 오픈 캠페인·크리에이터 상품 예치·환불을 포함해
        환불·지급·차감을 원장에 남깁니다.
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
          disabled={busy || !canRequest}
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
        <button type="button" disabled={busy || !canRequest} onClick={() => void adjust('refund')} className="h-10 rounded-full border border-zinc-200 px-3 text-xs font-semibold">
          환불
        </button>
        <button type="button" disabled={busy || !canRequest} onClick={() => void adjust('grant')} className="h-10 rounded-full border border-zinc-200 px-3 text-xs font-semibold">
          지급
        </button>
        <button type="button" disabled={busy || !canRequest} onClick={() => void adjust('deduct')} className="h-10 rounded-full border border-zinc-200 px-3 text-xs font-semibold">
          차감
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      <ul className="mt-3 flex flex-col gap-3 pb-24 md:hidden">
        {rows.map((row) => {
          const dealKind = creditDealKindFromDescription(row.description);
          const breakdown =
            row.type === 'HOLD' || row.type === 'RELEASE' || row.type === 'REFUND'
              ? campaignHoldLedgerLabel({
                  type: row.type,
                  amount: row.amount,
                  description: row.description,
                })
              : '';
          const typeLabel =
            row.type === 'CHARGE'
              ? '충전'
              : row.type === 'HOLD'
                ? '예치'
                : row.type === 'RELEASE'
                  ? '예치 해제'
                  : '환불';
          return (
            <li key={row.id} className="rounded-2xl border border-zinc-200 p-3">
              <p className="text-sm font-semibold text-zinc-950">
                {dealKind ? `${PAYOUT_DEAL_KIND_LABEL[dealKind]} · ` : ''}
                {typeLabel}
              </p>
              <dl className="mt-2 space-y-2 text-sm">
                <div>
                  <dt className="text-[11px] font-medium text-zinc-500">금액</dt>
                  <dd className="mt-0.5 break-all tabular-nums text-zinc-950">{formatWon(row.amount)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-zinc-500">잔액</dt>
                  <dd className="mt-0.5 break-all tabular-nums text-zinc-800">
                    {formatWon(row.balance_after)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-medium text-zinc-500">일시</dt>
                  <dd className="mt-0.5 break-words text-zinc-600">{formatDateTime(row.created_at)}</dd>
                </div>
                {breakdown ? (
                  <div>
                    <dt className="text-[11px] font-medium text-zinc-500">내역</dt>
                    <dd className="mt-0.5 break-words text-zinc-600">{breakdown}</dd>
                  </div>
                ) : null}
                {row.description && row.description !== breakdown ? (
                  <div>
                    <dt className="text-[11px] font-medium text-zinc-500">메모</dt>
                    <dd className="mt-0.5 break-all text-zinc-600">{row.description}</dd>
                  </div>
                ) : null}
                {row.reference_id ? (
                  <div>
                    <dt className="text-[11px] font-medium text-zinc-500">참조</dt>
                    <dd className="mt-0.5 break-all text-xs text-zinc-500">{row.reference_id}</dd>
                  </div>
                ) : null}
              </dl>
            </li>
          );
        })}
      </ul>
      <ul className="mt-3 hidden max-h-96 divide-y divide-zinc-100 overflow-y-auto pr-1 md:block">
        {rows.map((row) => (
          <CreditLedgerEntry key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}
