'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { authRequestInit } from '@/lib/auth-request';
import { businessActionBlock, type BusinessVerificationStatus } from '@/lib/business-registration';

type BusinessStatusNoticeProps = {
  intent: 'charge' | 'campaign';
  onChange?: (blocked: boolean) => void;
};

export function BusinessStatusNotice({ intent, onChange }: BusinessStatusNoticeProps) {
  const [notice, setNotice] = useState('');
  const [blocked, setBlocked] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch('/api/account/business', await authRequestInit({ cache: 'no-store' }));
      const body = (await response.json().catch(() => null)) as {
        status?: BusinessVerificationStatus;
        notice?: string;
        errorCode?: string;
      } | null;
      if (cancelled || !body || body.errorCode === 'SCHEMA_MISSING') {
        onChangeRef.current?.(false);
        return;
      }
      const message = businessActionBlock(body.status, intent);
      if (!cancelled) {
        setBlocked(Boolean(message));
        setNotice(message || body.notice || '');
        onChangeRef.current?.(Boolean(message));
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [intent]);

  if (!notice) {
    return null;
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
