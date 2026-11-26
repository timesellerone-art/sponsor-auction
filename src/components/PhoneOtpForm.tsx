'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { AUTH_FAIL_MESSAGE, sendPhoneOtp, verifyPhoneOtp, type PhoneVerifyResult } from '@/lib/auth';
import { isValidPhone } from '@/lib/contact';
import { cn } from '@/lib/utils';

type PhoneOtpFormProps = {
  phone: string;
  onPhoneChange: (value: string) => void;
  verified: boolean;
  onVerified: (result: PhoneVerifyResult) => void | Promise<void>;
  disabled?: boolean;
  required?: boolean;
};

export function PhoneOtpForm({
  phone,
  onPhoneChange,
  verified,
  onVerified,
  disabled = false,
  required = true,
}: PhoneOtpFormProps) {
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState<'send' | 'verify' | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(false);
  const isVerified = verified || done;

  useEffect(() => {
    if (cooldown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const handlePhoneChange = (value: string) => {
    onPhoneChange(value);
    setSent(false);
    setCode('');
    setDone(false);
  };

  const handleSend = async () => {
    if (busy || disabled || isVerified) {
      return;
    }
    if (!isValidPhone(phone)) {
      showToast('올바른 휴대전화 번호를 입력해 주세요.');
      return;
    }
    setBusy('send');
    try {
      const result = await sendPhoneOtp(phone);
      if (result.error) {
        showToast(result.error);
        return;
      }
      setSent(true);
      setCooldown(30);
      showToast('인증번호를 보냈습니다.', 'success');
    } catch {
      showToast(AUTH_FAIL_MESSAGE);
    } finally {
      setBusy(null);
    }
  };

  const handleVerify = async () => {
    if (busy || disabled || isVerified) {
      return;
    }
    if (!sent) {
      showToast('인증번호를 먼저 받아 주세요.');
      return;
    }
    setBusy('verify');
    try {
      const result = await verifyPhoneOtp(phone, code);
      if (result.error || !result.data) {
        showToast(result.error ?? AUTH_FAIL_MESSAGE);
        return;
      }
      if (result.data.duplicate) {
        await onVerified(result.data);
        return;
      }
      showToast('휴대전화 인증이 완료되었습니다.', 'success');
      setCode('');
      setDone(true);
      await onVerified(result.data);
    } catch {
      showToast(AUTH_FAIL_MESSAGE);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-zinc-800">
          휴대전화
          {required ? <span className="ml-1 text-clink-accent">*</span> : null}
        </span>
        <div className="flex gap-2">
          <input
            type="tel"
            autoComplete="tel"
            inputMode="numeric"
            value={phone}
            disabled={disabled || Boolean(busy) || isVerified}
            onChange={(event) => handlePhoneChange(event.target.value)}
            className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950 outline-none focus:border-clink-accent focus:ring-2 focus:ring-clink-peach-strong disabled:bg-zinc-50"
            placeholder="01012345678"
          />
          <button
            type="button"
            disabled={disabled || Boolean(busy) || isVerified || cooldown > 0}
            onClick={() => {
              void handleSend();
            }}
            className={cn(
              'h-11 shrink-0 rounded-full px-3 text-xs font-semibold',
              isVerified
                ? 'bg-zinc-100 text-zinc-500'
                : 'bg-zinc-950 text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300',
            )}
          >
            {busy === 'send' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : isVerified ? (
              '인증 완료'
            ) : cooldown > 0 ? (
              `${cooldown}초`
            ) : sent ? (
              '재전송'
            ) : (
              '인증번호'
            )}
          </button>
        </div>
      </label>

      {isVerified ? (
        <p className="text-sm font-medium text-clink-accent">휴대전화 인증이 완료되었습니다.</p>
      ) : (
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-800">인증번호</span>
          <div className="flex gap-2">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              disabled={disabled || Boolean(busy) || !sent}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 px-3 text-sm tracking-[0.3em] text-zinc-950 outline-none focus:border-clink-accent focus:ring-2 focus:ring-clink-peach-strong disabled:bg-zinc-50"
              placeholder="000000"
            />
            <button
              type="button"
              disabled={disabled || Boolean(busy) || !sent || code.length !== 6}
              onClick={() => {
                void handleVerify();
              }}
              className="h-11 shrink-0 rounded-full bg-clink px-3 text-xs font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
            >
              {busy === 'verify' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : '확인'}
            </button>
          </div>
        </label>
      )}
    </div>
  );
}
