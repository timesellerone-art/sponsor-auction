'use client';

import { useEffect, useState } from 'react';
import { authRequestInit } from '@/lib/auth-request';
import {
  businessNumberError,
  businessVerificationLabel,
  formatBusinessNumber,
  formatOpeningDateInput,
  normalizeBusinessNumber,
  normalizeOpeningDate,
  openingDateError,
  representativeNameError,
  type BusinessVerificationStatus,
} from '@/lib/business-registration';

type BusinessPayload = {
  businessNumber?: string;
  representativeName?: string;
  openedOn?: string;
  status?: BusinessVerificationStatus;
  detail?: string;
  reviewNote?: string;
  notice?: string;
  ntsLabel?: string;
  suggestedStatus?: BusinessVerificationStatus;
  mismatch?: boolean;
  error?: string;
  errorCode?: string;
  lookupError?: { code: string; message: string } | null;
};

export function BusinessRegistrationForm() {
  const [number, setNumber] = useState('');
  const [representativeName, setRepresentativeName] = useState('');
  const [openedOn, setOpenedOn] = useState('');
  const [status, setStatus] = useState<BusinessVerificationStatus>('unregistered');
  const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState('');
  const [ntsLabel, setNtsLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const applyPayload = (body: BusinessPayload | null) => {
    if (!body) {
      return;
    }
    if (body.businessNumber) {
      setNumber(body.businessNumber);
    }
    if (typeof body.representativeName === 'string') {
      setRepresentativeName(body.representativeName);
    }
    if (typeof body.openedOn === 'string') {
      setOpenedOn(formatOpeningDateInput(body.openedOn));
    }
    if (body.status) {
      setStatus(body.status);
    }
    setNotice(body.notice ?? '');
    setDetail(body.detail ?? '');
    setNtsLabel(body.ntsLabel || '');
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch('/api/account/business', await authRequestInit({ cache: 'no-store' }));
      const body = (await response.json().catch(() => null)) as BusinessPayload | null;
      if (cancelled || !body) {
        return;
      }
      applyPayload(body);
      if (body.errorCode === 'SCHEMA_MISSING') {
        setError(body.error ?? null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const lookupStatus = async () => {
    const invalid = businessNumberError(number);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        '/api/business/status',
        await authRequestInit({
          method: 'POST',
          cache: 'no-store',
          body: JSON.stringify({ businessNumber: number }),
        }),
      );
      const body = (await response.json().catch(() => null)) as BusinessPayload | null;
      if (!response.ok || !body) {
        throw new Error(body?.error || '사업자 상태를 조회하지 못했습니다.');
      }
      setNtsLabel(body.ntsLabel || '');
      setDetail(body.detail ?? '');
      setNotice(body.detail || body.notice || '');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '사업자 상태를 조회하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const persist = async () => {
    const numberInvalid = businessNumberError(number);
    if (numberInvalid) {
      setError(numberInvalid);
      return;
    }
    const nameInvalid = representativeNameError(representativeName);
    if (nameInvalid) {
      setError(nameInvalid);
      return;
    }
    const dateInvalid = openingDateError(openedOn);
    if (dateInvalid) {
      setError(dateInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        '/api/account/business',
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({
            businessNumber: number,
            representativeName,
            openedOn: normalizeOpeningDate(openedOn),
          }),
        }),
      );
      const body = (await response.json().catch(() => null)) as BusinessPayload | null;
      applyPayload(body);
      if (body?.errorCode === 'MISMATCH' || body?.mismatch) {
        setError(
          body.error ||
            body.lookupError?.message ||
            '대표자 성명 또는 개업일자가 국세청 등록 정보와 일치하지 않습니다.',
        );
        return;
      }
      if (!response.ok || !body?.status) {
        throw new Error(body?.error || '사업자등록번호를 저장하지 못했습니다.');
      }
      setError(body.lookupError?.message ?? null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '사업자 상태를 조회하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold text-zinc-950">사업자등록번호</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        사업자등록번호로 계속사업자·휴업·폐업을 조회하고, 대표자 성명과 개업일자로 국세청 진위확인을 합니다.
        번호·성명·개업일자가 모두 일치하고 계속사업자이면 관리자 검수 후 인증됩니다.
      </p>
      <p className="mt-3 text-sm font-semibold text-zinc-800">
        현재 상태: {businessVerificationLabel(status)}
        {ntsLabel ? ` · ${ntsLabel}` : ''}
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
        onChange={(event) => {
          const next = formatBusinessNumber(event.target.value);
          setNumber(next);
          const digits = normalizeBusinessNumber(next);
          if (digits.length === 10) {
            setError(businessNumberError(next));
            return;
          }
          if (digits.length === 0) {
            setError(null);
          }
        }}
        onBlur={() => {
          const digits = normalizeBusinessNumber(number);
          if (digits.length > 0) {
            setError(businessNumberError(number));
          }
        }}
        placeholder="000-00-00000"
        className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-950"
      />
      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="business-representative">
        대표자 성명
      </label>
      <input
        id="business-representative"
        value={representativeName}
        onChange={(event) => {
          setRepresentativeName(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (representativeName.trim()) {
            setError(representativeNameError(representativeName));
          }
        }}
        placeholder="국세청에 등록된 대표자 성명"
        autoComplete="name"
        className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-950"
      />
      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="business-opened-on">
        개업일자
      </label>
      <input
        id="business-opened-on"
        type="date"
        value={formatOpeningDateInput(openedOn)}
        onChange={(event) => {
          setOpenedOn(formatOpeningDateInput(event.target.value));
          setError(null);
        }}
        onBlur={() => {
          if (normalizeOpeningDate(openedOn)) {
            setError(openingDateError(openedOn));
          }
        }}
        className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-950"
      />
      <p className="mt-1 text-xs text-zinc-500">YYYYMMDD 기준이며, 상호명이 아닌 대표자 성명과 함께 진위확인합니다.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void lookupStatus()}
          className="h-10 rounded-full border border-zinc-200 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
        >
          상태 조회
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void persist()}
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
