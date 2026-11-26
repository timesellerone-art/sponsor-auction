'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { PhoneOtpForm } from '@/components/PhoneOtpForm';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { signOut, type PhoneVerifyResult } from '@/lib/auth';
import { POST_AUTH_HOME } from '@/lib/auth-guard';
import {
  existingAccountLoginPath,
  needsPhoneOnboarding,
} from '@/lib/phone-signup';

export default function PhoneOnboardingPage() {
  const router = useRouter();
  const { user, ready, refresh } = useAuth();
  const [phone, setPhone] = useState('');
  const [verified, setVerified] = useState(false);
  const [duplicateMessage, setDuplicateMessage] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

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

  const goLoginWithNotice = async (message: string) => {
    if (leaving) {
      return;
    }
    setLeaving(true);
    try {
      await signOut();
    } finally {
      window.location.replace(existingAccountLoginPath(message));
    }
  };

  const handleVerified = async (result: PhoneVerifyResult) => {
    if (result.duplicate) {
      setDuplicateMessage(
        result.message || '이미 가입된 회원입니다. 기존 계정으로 로그인해 주세요.',
      );
      return;
    }
    setVerified(true);
    showToast('휴대전화 인증이 완료되었습니다. 가입이 확정되었습니다.', 'success');
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
        최초 1회 휴대폰 인증을 완료해야 가입이 확정됩니다. 이미 가입된 번호라면 새 계정을 만들지
        않고 기존 로그인 수단으로 안내합니다.
      </p>
      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-5">
        <PhoneOtpForm
          phone={phone}
          onPhoneChange={setPhone}
          verified={verified}
          disabled={Boolean(duplicateMessage) || leaving}
          onVerified={(result) => {
            void handleVerified(result);
          }}
        />
      </div>

      <ConfirmModal
        open={Boolean(duplicateMessage)}
        title="이미 가입된 회원입니다"
        description={duplicateMessage || ''}
        confirmLabel="기존 계정으로 로그인"
        cancelLabel="닫기"
        busy={leaving}
        onConfirm={() => {
          if (duplicateMessage) {
            void goLoginWithNotice(duplicateMessage);
          }
        }}
        onClose={() => {
          if (duplicateMessage) {
            void goLoginWithNotice(duplicateMessage);
          }
        }}
      />
    </div>
  );
}
