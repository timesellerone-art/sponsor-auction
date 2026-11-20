'use client';

import { useEffect, useState } from 'react';
import { authRequestInit } from '@/lib/auth-request';
import { businessVerificationLabel, type BusinessVerificationStatus } from '@/lib/business-registration';

type BusinessPayload = {
  businessNumber?: string;
  status?: BusinessVerificationStatus;
  detail?: string;
  reviewNote?: string;
  notice?: string;
  error?: string;
  errorCode?: string;
  lookupError?: { code: string; message: string } | null;
  ntsLabel?: string;
};

export function BusinessRegistrationForm() {
  const [number, setNumber] = useState('');
  const [status, setStatus] = useState<BusinessVerificationStatus>('unregistered');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch('/api/account/business', await authRequestInit({ cache: 'no-store' }));
      const body = (await response.json().catch(() => null)) as BusinessPayload | null;
      if (cancelled || !body) {
        return;
      }
      setNumber(body.businessNumber ?? '');
      setStatus(body.status ?? 'unregistered');
      setNotice(body.notice ?? '');
      setDetail(body.detail ?? '');
      if (body.errorCode === 'SCHEMA_MISSING') {
        setError(body.error ?? null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const lookup = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        '/api/business/status',
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({ businessNumber: number }),
        }),
      );
      const body = (await response.json().catch(() => null)) as BusinessPayload | null;
      if (!response.ok) {
        throw new Error(body?.error || '사업자 상태를 조회하지 못했습니다.');
      }
      setDetail(body?.detail || body?.ntsLabel || '');
      setNotice(body?.ntsLabel ? `국세청 조회: ${body.ntsLabel}` : '조회가 완료되었습니다.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '사업자 상태를 조회하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        '/api/account/business',
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({ businessNumber: number }),
        }),
      );
      const body = (await response.json().catch(() => null)) as BusinessPayload | null;
      if (!response.ok || !body?.status) {
        throw new Error(body?.error || '사업자등록번호를 저장하지 못했습니다.');
      }
      setNumber(body.businessNumber ?? number);
      setStatus(body.status);
      setDetail(body.detail ?? '');
      setNotice(body.notice ?? '');
      if (body.lookupError?.message) {
        setError(body.lookupError.message);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '사업자등록번호를 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold text-zinc-950">사업자등록번호</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        광고주 계정의 10자리 번호를 저장하면 국세청 상태로 계속사업자와 휴폐업을 구분합니다. 계속사업자는 관리자 검수 후 인증됩니다.
      </p>
      <p className="mt-3 text-sm font-semibold text-zinc-800">
        현재 상태: {businessVerificationLabel(status)}
      </p>
      {notice ? <p className="mt-1 text-sm text-zinc-600">{notice}</p> : null}
      {detail && detail !== notice ? <p className="mt-1 text-sm text-zinc-500">{detail}</p> : null}
      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="business-number">
        사업자등록번호
      </label>
      <input
        id="business-number"
        inputMode="numeric"
        value={number}
        onChange={(event) => setNumber(event.target.value)}
        placeholder="000-00-00000"
        className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-950"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void lookup()}
          className="h-10 rounded-full border border-zinc-200 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
        >
          상태 조회
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="h-10 rounded-full bg-clink px-4 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          저장
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
