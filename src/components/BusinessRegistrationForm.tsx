'use client';

import { useEffect, useState } from 'react';
import { authRequestInit } from '@/lib/auth-request';
import {
  allowsBusinessCertificateUpload,
  validateBusinessCertificateFile,
} from '@/lib/business-certificate';
import {
  businessAddressError,
  businessContactError,
  businessNumberError,
  businessVerificationLabel,
  companyNameError,
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
  errorMessage?: string;
  lookupError?: { code: string; message: string } | null;
  certificateName?: string;
  hasCertificate?: boolean;
  companyName?: string;
  address?: string;
  contact?: string;
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
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [certificateName, setCertificateName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [mismatch, setMismatch] = useState(false);

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
    if (typeof body.companyName === 'string') {
      setCompanyName(body.companyName);
    }
    if (typeof body.address === 'string') {
      setAddress(body.address);
    }
    if (typeof body.contact === 'string') {
      setContact(body.contact);
    }
    if (body.status) {
      setStatus(body.status);
    }
    setNotice(body.notice ?? '');
    setDetail(body.detail ?? '');
    setNtsLabel(body.ntsLabel || '');
    setMismatch(Boolean(body.mismatch || body.errorCode === 'MISMATCH' || body.ntsLabel === '불일치'));
    if (body.hasCertificate) {
      setCertificateName(body.certificateName?.trim() || '첨부됨');
    } else if (body.hasCertificate === false) {
      setCertificateName('');
    } else if (typeof body.certificateName === 'string' && body.certificateName.trim()) {
      setCertificateName(body.certificateName);
    }
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

  const identityError = () =>
    businessNumberError(number) || representativeNameError(representativeName) || openingDateError(openedOn);

  const lookupStatus = async () => {
    const invalid = identityError();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(
        '/api/business/status',
        await authRequestInit({
          method: 'POST',
          cache: 'no-store',
          body: JSON.stringify({
            businessNumber: number,
            representativeName,
            openedOn: normalizeOpeningDate(openedOn),
          }),
        }),
      );
      const body = (await response.json().catch(() => null)) as BusinessPayload | null;
      if (body?.errorCode === 'MISMATCH' || body?.mismatch) {
        setNtsLabel(body.ntsLabel || '불일치');
        setDetail(body.detail ?? '');
        setNotice('');
        setMismatch(true);
        setError(
          body.error ||
            '대표자 성명 또는 개업일자가 국세청 등록 정보와 일치하지 않습니다.',
        );
        return;
      }
      if (!response.ok || !body) {
        throw new Error(body?.error || '사업자 상태를 조회하지 못했습니다.');
      }
      setNtsLabel(body.ntsLabel || '');
      setDetail(body.detail ?? '');
      setNotice(body.detail || body.notice || '');
      setMismatch(false);
      if (body.status) {
        setStatus(body.status);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '사업자 상태를 조회하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const persist = async () => {
    const invalid =
      identityError() ||
      companyNameError(companyName) ||
      businessAddressError(address) ||
      businessContactError(contact);
    if (invalid) {
      setSaveMessage(null);
      setError(invalid);
      return;
    }
    if (
      allowsBusinessCertificateUpload({ status, ntsLabel, mismatch }) &&
      !certificateName.trim()
    ) {
      setSaveMessage(null);
      setError('사업자등록증 사본을 첨부한 뒤 저장해 주세요.');
      return;
    }
    setBusy(true);
    setError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(
        '/api/account/business',
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({
            businessNumber: number,
            representativeName,
            openedOn: normalizeOpeningDate(openedOn),
            companyName,
            address,
            contact,
            business_registration_number: number,
            business_representative_name: representativeName,
            business_opened_on: normalizeOpeningDate(openedOn),
            business_company_name: companyName,
            business_address: address,
            business_contact: contact,
          }),
        }),
      );
      const body = (await response.json().catch(() => null)) as BusinessPayload | null;
      if (!response.ok) {
        const detail =
          body?.errorMessage?.trim() ||
          body?.error?.replace(/^\[[A-Z_]+\]\s*/, '').trim() ||
          body?.lookupError?.message ||
          '알 수 없는 오류';
        applyPayload(body);
        setSaveMessage(null);
        setError(`저장에 실패했습니다: [${response.status}] ${detail}`);
        return;
      }
      applyPayload(body);
      const refreshed = await fetch('/api/account/business', await authRequestInit({ cache: 'no-store' }));
      const latest = (await refreshed.json().catch(() => null)) as BusinessPayload | null;
      if (refreshed.ok && latest) {
        applyPayload(latest);
      }
      setError(null);
      setSaveMessage('사업자 정보가 저장되었습니다. 관리자 검수 후 인증이 완료됩니다.');
    } catch (reason) {
      setSaveMessage(null);
      setError(
        `저장에 실패했습니다: ${
          reason instanceof Error ? reason.message : '네트워크 오류가 발생했습니다.'
        }`,
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadAllowed = allowsBusinessCertificateUpload({ status, ntsLabel, mismatch });
  const detailsReady =
    !identityError() &&
    !companyNameError(companyName) &&
    !businessAddressError(address) &&
    !businessContactError(contact);
  const canPersist = uploadAllowed && detailsReady && Boolean(certificateName.trim());

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
      <h2 className="text-lg font-bold text-zinc-950">사업자 인증</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        사업자등록번호·대표자 성명·개업일자로 국세청 상태 조회를 한 뒤, 상호명·사업장 주소·연락처와
        사업자등록증 사본을 저장하면 관리자가 검수합니다. 대표자 성명은 가입자 이름과 달라도 됩니다.
      </p>
      <p
        className={
          status === 'verified'
            ? 'mt-4 text-lg font-bold leading-7 text-emerald-800'
            : ntsLabel === '불일치' || status === 'rejected' || status === 'closed'
              ? 'mt-4 text-lg font-bold leading-7 text-rose-700'
              : status === 'review_required'
                ? 'mt-4 text-lg font-bold leading-7 text-amber-900'
                : 'mt-4 text-lg font-bold leading-7 text-zinc-950'
        }
      >
        현재 상태: {businessVerificationLabel(status)}
        {ntsLabel ? ` · ${ntsLabel}` : ''}
      </p>
      {notice ? (
        <p
          className={
            ntsLabel === '불일치' || /불일치|일치하지 않습니다/.test(notice)
              ? 'mt-3 rounded-xl bg-rose-50 px-3 py-3 text-base font-semibold leading-7 text-rose-700'
              : 'mt-2 text-base font-medium leading-7 text-zinc-700'
          }
        >
          {notice}
        </p>
      ) : null}
      {detail && detail !== notice ? (
        <p
          className={
            ntsLabel === '불일치' || /불일치|일치하지 않습니다/.test(detail)
              ? 'mt-3 rounded-xl bg-rose-50 px-3 py-3 text-base font-semibold leading-7 text-rose-700'
              : 'mt-2 text-base leading-7 text-zinc-600'
          }
        >
          {detail}
        </p>
      ) : null}
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
      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="business-company">
        상호명
      </label>
      <input
        id="business-company"
        value={companyName}
        onChange={(event) => {
          setCompanyName(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (companyName.trim()) {
            setError(companyNameError(companyName));
          }
        }}
        placeholder="사업자등록증의 상호명"
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
        placeholder="사업자등록증의 대표자 성명 (가입자 이름과 달라도 됩니다)"
        autoComplete="off"
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
      <p className="mt-1 text-xs text-zinc-500">YYYYMMDD 기준이며, 상호명이 아닌 대표자 성명과 함께 상태 조회합니다.</p>
      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="business-address">
        사업장 상세 주소
      </label>
      <input
        id="business-address"
        value={address}
        onChange={(event) => {
          setAddress(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (address.trim()) {
            setError(businessAddressError(address));
          }
        }}
        placeholder="도로명 또는 지번 주소, 동·호수까지"
        autoComplete="street-address"
        className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-950"
      />
      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="business-contact">
        사업자 연락처
      </label>
      <input
        id="business-contact"
        value={contact}
        onChange={(event) => {
          setContact(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (contact.trim()) {
            setError(businessContactError(contact));
          }
        }}
        placeholder="02-0000-0000, 1544-0000, 080-000-0000, 010-0000-0000"
        inputMode="tel"
        autoComplete="tel"
        className="mt-2 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-950"
      />
      <p className="mt-1 text-xs text-zinc-500">유선전화, 전국대표번호, 080, 휴대폰 모두 가능합니다.</p>
      <label className="mt-4 block text-sm font-medium text-zinc-700" htmlFor="business-certificate">
        사업자등록증 사본
      </label>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
            <input
              id="business-certificate"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="sr-only"
              disabled={busy || !uploadAllowed}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                event.target.value = '';
                if (!file) {
                  return;
                }
                void (async () => {
                  const invalid = validateBusinessCertificateFile(file);
                  if (invalid) {
                    setError(invalid);
                    return;
                  }
                  if (!allowsBusinessCertificateUpload({ status, ntsLabel, mismatch })) {
                    setError('국세청 상태 조회가 정상인 경우에만 사업자등록증을 올릴 수 있습니다.');
                    return;
                  }
                  setBusy(true);
                  setError(null);
                  try {
                    const init = await authRequestInit({ method: 'POST' });
                    const form = new FormData();
                    form.append('file', file);
                    const response = await fetch('/api/account/business/certificate', {
                      ...init,
                      body: form,
                    });
                    const body = (await response.json().catch(() => null)) as {
                      name?: string;
                      error?: string;
                    } | null;
                    if (!response.ok) {
                      throw new Error(body?.error || '사업자등록증을 올리지 못했습니다.');
                    }
                    setCertificateName(body?.name || file.name);
                  } catch (reason) {
                    setError(
                      reason instanceof Error ? reason.message : '사업자등록증을 올리지 못했습니다.',
                    );
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            />
            <label
              htmlFor="business-certificate"
              className={
                busy || !uploadAllowed
                  ? 'inline-flex h-10 cursor-not-allowed items-center rounded-full border border-zinc-200 px-4 text-sm font-semibold text-zinc-400'
                  : 'inline-flex h-10 cursor-pointer items-center rounded-full border border-zinc-200 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50'
              }
            >
              파일 선택
            </label>
            {certificateName ? (
              <span className="min-w-0 flex-1 truncate text-sm text-zinc-600">{certificateName}</span>
            ) : (
              <span className="text-sm text-zinc-400">JPG, PNG, PDF · 10MB 이하</span>
            )}
            {certificateName ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    const response = await fetch(
                      '/api/account/business/certificate',
                      await authRequestInit({ cache: 'no-store' }),
                    );
                    const body = (await response.json().catch(() => null)) as {
                      url?: string;
                      error?: string;
                    } | null;
                    if (!response.ok || !body?.url) {
                      setError(body?.error || '사업자등록증을 열 수 없습니다.');
                      return;
                    }
                    window.open(body.url, '_blank', 'noopener,noreferrer');
                  })();
                }}
                className="h-10 rounded-full border border-zinc-200 px-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
              >
                사본 미리보기/열기
              </button>
            ) : null}
      </div>
      {!uploadAllowed ? (
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          국세청 상태 조회가 정상(계속사업자)일 때만 첨부할 수 있습니다. 불일치·휴폐업이면 업로드가
          차단됩니다.
        </p>
      ) : null}
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
          disabled={busy || !canPersist}
          onClick={() => void persist()}
          className="h-10 rounded-full bg-clink px-4 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {busy ? '저장 중...' : '저장'}
        </button>
      </div>
      {saveMessage ? (
        <p
          role="status"
          className="mt-3 rounded-xl bg-emerald-50 px-3 py-3 text-base font-semibold leading-7 text-emerald-800"
        >
          {saveMessage}
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-rose-50 px-3 py-3 text-base font-semibold leading-7 text-rose-700"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
