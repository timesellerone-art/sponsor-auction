'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { PhoneOtpForm } from '@/components/PhoneOtpForm';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { ACCOUNT_UNIFIED_MESSAGE } from '@/lib/account-unify';
import { type PhoneVerifyResult } from '@/lib/auth';
import { POST_AUTH_HOME } from '@/lib/auth-guard';
import { needsPhoneOnboarding } from '@/lib/phone-signup';

export default function PhoneOnboardingPage() {
  const router = useRouter();
  const { user, ready, refresh } = useAuth();
  const [phone, setPhone] = useState('');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (!ready) {
      return;
    }
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!needsPhoneOnboarding(user)) {
      router.replace(POST_AUTH_HOME);
    }
  }, [ready, router, user]);

  const handleVerified = async (result: PhoneVerifyResult) => {
    setVerified(true);
    showToast(
      result.merged
        ? result.message || ACCOUNT_UNIFIED_MESSAGE
        : '휴대전화 인증이 완료되었습니다. 가입이 확정되었습니다.',
      'success',
    );
    await refresh();
    router.replace(POST_AUTH_HOME);
  };

  if (!ready || !user || !needsPhoneOnboarding(user)) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16">
        <Loader2 className="size-6 animate-spin text-clink-accent" aria-hidden />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center px-4 py-10 sm:px-6">
      <p className="text-sm font-semibold tracking-wide text-clink-accent">가입 확인</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-950">휴대폰 번호 인증</h1>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        최초 1회 휴대폰 인증을 완료하면 Google, 네이버, 카카오, 이메일 어떤 수단으로 다시 들어와도
        재인증하지 않습니다. 이미 인증된 번호라면 현재 로그인한 계정을 기존 회원에 연결합니다.
      </p>
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <PhoneOtpForm
          phone={phone}
          onPhoneChange={setPhone}
          verified={verified}
          onVerified={(result) => {
            void handleVerified(result);
          }}
        />
      </div>
    </div>
  );
}
