'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authRequestInit } from '@/lib/auth-request';
import {
  businessActionBlock,
  CAMPAIGN_BUSINESS_REQUIRED_NOTICE,
  TIMESLOT_BUSINESS_REQUIRED_NOTICE,
  type BusinessVerificationStatus,
} from '@/lib/business-registration';

type BusinessStatusNoticeProps = {
  intent: 'charge' | 'campaign' | 'timeslot';
  onChange?: (blocked: boolean) => void;
  onVerifyNavigate?: () => void;
};

export function BusinessStatusNotice({
  intent,
  onChange,
  onVerifyNavigate,
}: BusinessStatusNoticeProps) {
  const router = useRouter();
  const gated = intent === 'campaign' || intent === 'timeslot';
  const gateNotice =
    intent === 'timeslot'
      ? TIMESLOT_BUSINESS_REQUIRED_NOTICE
      : CAMPAIGN_BUSINESS_REQUIRED_NOTICE;
  const [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState(gated);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (gated) {
      onChangeRef.current?.(true);
    }
  }, [gated]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch('/api/account/business', await authRequestInit({ cache: 'no-store' }));
        const body = (await response.json().catch(() => null)) as {
          status?: BusinessVerificationStatus;
          notice?: string;
          errorCode?: string;
        } | null;
        if (cancelled) {
          return;
        }
        if (!body || body.errorCode === 'SCHEMA_MISSING' || body.errorCode === 'LOOKUP_FAILED') {
          if (gated) {
            setBlocked(true);
            setNotice(gateNotice);
            onChangeRef.current?.(true);
          } else {
            onChangeRef.current?.(false);
          }
          return;
        }
        const message = businessActionBlock(body.status, intent);
        const nextBlocked = Boolean(message);
        setBlocked(nextBlocked);
        if (gated) {
          setNotice(nextBlocked ? gateNotice : '');
        } else {
          setNotice(message || body.notice || '');
        }
        onChangeRef.current?.(nextBlocked);
      } catch {
        if (cancelled) {
          return;
        }
        if (gated) {
          setBlocked(true);
          setNotice(gateNotice);
          onChangeRef.current?.(true);
        } else {
          onChangeRef.current?.(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [gated, gateNotice, intent]);

  if (!notice) {
    return null;
  }

  if (gated) {
    return (
      <div className="rounded-xl bg-rose-50 px-3 py-3 text-sm leading-6 text-rose-700">
        <p>{gateNotice}</p>
        <button
          type="button"
          className="mt-2 inline-flex h-9 items-center justify-center rounded-full bg-clink px-3 text-xs font-semibold text-white hover:bg-stone-800"
          onClick={() => {
            onVerifyNavigate?.();
            router.push('/my/settings');
          }}
        >
          사업자 인증하러 가기
        </button>
      </div>
    );
  }

  return (
    <p
      className={
        blocked
          ? 'rounded-xl bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-700'
          : 'rounded-xl bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900'
      }
    >
      {notice}{' '}
      <Link href="/my/settings" className="font-semibold underline">
        계정 설정
      </Link>
    </p>
  );
}
