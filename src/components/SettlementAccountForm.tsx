'use client';

import { useEffect, useState } from 'react';
import { BankSelect } from '@/components/BankSelect';
import { authRequestInit } from '@/lib/auth-request';
import { canonicalBankName } from '@/lib/banks';
import {
  SETTLEMENT_ACCOUNT_SECTION_ID,
  SETTLEMENT_TYPE_LABEL,
  type CreatorSettlementProfile,
  type SettlementType,
} from '@/lib/settlement-account';

type SettlementPayload = CreatorSettlementProfile & {
  error?: string;
  errorCode?: string;
};

const inputClass =
  'mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-950';

export function SettlementAccountForm() {
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [settlementType, setSettlementType] = useState<SettlementType>('individual');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch('/api/account/settlement', await authRequestInit({ cache: 'no-store' }));
      const body = (await response.json().catch(() => null)) as SettlementPayload | null;
      if (cancelled || !body) {
        return;
      }
      setBankName(canonicalBankName(body.bankName ?? ''));
      setAccountNumber(body.accountNumber ?? '');
      setAccountHolder(body.accountHolder ?? '');
      setSettlementType(body.settlementType === 'business' ? 'business' : 'individual');
      if (body.errorCode === 'SCHEMA_MISSING') {
        setError(body.error ?? null);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (window.location.hash !== `#${SETTLEMENT_ACCOUNT_SECTION_ID}`) {
      return;
    }
    document
      .getElementById(SETTLEMENT_ACCOUNT_SECTION_ID)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const save = async () => {
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      const response = await fetch(
        '/api/account/settlement',
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({ bankName, accountNumber, accountHolder, settlementType }),
        }),
      );
      const body = (await response.json().catch(() => null)) as SettlementPayload | null;
      if (!response.ok) {
        throw new Error(body?.error || '정산 계좌를 저장하지 못했습니다.');
      }
      setBankName(canonicalBankName(body?.bankName ?? bankName));
      setAccountNumber(body?.accountNumber ?? accountNumber);
      setAccountHolder(body?.accountHolder ?? accountHolder);
      setSettlementType(body?.settlementType === 'business' ? 'business' : settlementType);
      setNotice('정산 계좌를 저장했습니다.');
      window.dispatchEvent(new Event('settlement:changed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '정산 계좌를 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      id={SETTLEMENT_ACCOUNT_SECTION_ID}
      className="mt-8 scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6"
    >
      <h2 className="text-lg font-bold text-zinc-950">정산 계좌</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        정산 입금 계좌와 유형을 저장하면 이후 제안·정산에 기본값으로 불러옵니다.
      </p>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-zinc-700">정산 유형</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {(['individual', 'business'] as const).map((type) => {
            const selected = settlementType === type;
            return (
              <label
                key={type}
                className={`inline-flex h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold ${
                  selected
                    ? 'bg-zinc-950 text-white'
                    : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                }`}
              >
                <input
                  type="radio"
                  name="settlement-type"
                  value={type}
                  checked={selected}
                  onChange={() => setSettlementType(type)}
                  className="sr-only"
                />
                {SETTLEMENT_TYPE_LABEL[type]}
              </label>
            );
          })}
        </div>
      </fieldset>

      {settlementType === 'business' ? (
        <p className="mt-3 text-sm text-zinc-500">
          사업자등록번호는 계정 설정에서 저장하고, 관리자 검증이 끝나면 세금계산서로 정산됩니다.
        </p>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">개인 프리랜서는 원천징수 기준으로 정산됩니다.</p>
      )}

      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="settlement-bank-name">
        은행명
      </label>
      <BankSelect
        id="settlement-bank-name"
        value={bankName}
        onChange={setBankName}
        className="mt-2"
      />

      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="settlement-account-number">
        계좌번호
      </label>
      <input
        id="settlement-account-number"
        inputMode="numeric"
        value={accountNumber}
        onChange={(event) => setAccountNumber(event.target.value)}
        placeholder="예: 110123456789"
        autoComplete="off"
        className={inputClass}
      />

      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="settlement-account-holder">
        예금주
      </label>
      <input
        id="settlement-account-holder"
        value={accountHolder}
        onChange={(event) => setAccountHolder(event.target.value)}
        placeholder="계좌 예금주명"
        autoComplete="name"
        className={inputClass}
      />

      <div className="mt-4">
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="h-10 rounded-full bg-clink px-4 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {busy ? '저장 중...' : '저장'}
        </button>
      </div>
      {notice ? <p className="mt-3 text-sm text-zinc-600">{notice}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
