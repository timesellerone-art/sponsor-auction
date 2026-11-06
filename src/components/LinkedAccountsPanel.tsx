'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Loader2, Smartphone, X } from 'lucide-react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { signInWithOAuth } from '@/lib/auth';
import { loginPath } from '@/lib/auth-guard';
import {
  listLinkedAccountStatuses,
  type LinkedAccountStatus,
  type SocialIdentityProvider,
} from '@/lib/auth-identities';
import { isDemoAccountEmail } from '@/lib/auth-mock';
import { authRequestInit } from '@/lib/auth-request';
import { cn } from '@/lib/utils';

type AccountsResponse = {
  data?: { accounts?: LinkedAccountStatus[] };
  error?: string;
};

function providerButtonClass(provider: SocialIdentityProvider, linked: boolean) {
  if (linked) {
    return 'border-zinc-200 bg-white';
  }
  if (provider === 'kakao') {
    return 'border-[#FEE500] bg-[#FEE500]';
  }
  if (provider === 'naver') {
    return 'border-[#03C75A] bg-[#03C75A] text-white';
  }
  if (provider === 'google') {
    return 'border-zinc-200 bg-white';
  }
  return 'border-teal-200 bg-teal-50';
}

function ProviderMark({ provider }: { provider: SocialIdentityProvider }) {
  if (provider === 'google') {
    return (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path
          fill="#4285F4"
          d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46c-.28 1.48-1.12 2.74-2.39 3.58v2.98h3.86c2.26-2.08 3.56-5.14 3.56-8.59z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.86-2.98c-1.07.72-2.45 1.15-4.09 1.15-3.14 0-5.8-2.12-6.75-4.97H1.27v3.07C3.25 21.3 7.31 24 12 24z"
        />
        <path
          fill="#FBBC05"
          d="M5.25 14.3A7.2 7.2 0 0 1 4.86 12c0-.8.14-1.57.39-2.3V6.63H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.37l3.98-3.07z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.63l3.98 3.07C6.2 6.87 8.86 4.75 12 4.75z"
        />
      </svg>
    );
  }
  if (provider === 'kakao') {
    return (
      <svg viewBox="0 0 24 24" className="size-5" aria-hidden>
        <path
          fill="#191919"
          d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.86 5.33 4.66 6.74L5.7 21.3c-.14.5.45.9.86.58l3.94-2.64c.48.07.97.1 1.5.1 5.52 0 10-3.58 10-8s-4.48-8-10-8z"
        />
      </svg>
    );
  }
  if (provider === 'naver') {
    return (
      <span className="flex size-6 items-center justify-center rounded-sm bg-white text-xs font-black leading-none text-[#03C75A]">
        N
      </span>
    );
  }
  return <Smartphone className="size-5 text-teal-800" aria-hidden />;
}

export function LinkedAccountsPanel() {
  const titleId = useId();
  const router = useRouter();
  const { user, ready, refresh } = useAuth();
  const [accounts, setAccounts] = useState<LinkedAccountStatus[]>(() =>
    listLinkedAccountStatuses(null),
  );
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState<SocialIdentityProvider | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<SocialIdentityProvider | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneBusy, setPhoneBusy] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!ready) {
      return;
    }
    if (!user) {
      setLoading(false);
      router.replace(loginPath('advertiser-auth', '/my/settings'));
      return;
    }
    if (isDemoAccountEmail(user.email)) {
      setAccounts(listLinkedAccountStatuses(null));
      setLoading(false);
      return;
    }

    try {
      let response = await fetch('/api/auth/identities', await authRequestInit());
      if (response.status === 401) {
        await refresh();
        response = await fetch('/api/auth/identities', await authRequestInit());
      }
      if (response.status === 401) {
        setAccounts(listLinkedAccountStatuses(null));
        setLoading(false);
        return;
      }
      const payload = (await response.json().catch(() => null)) as AccountsResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error || '연동 계정을 불러오지 못했습니다.');
      }
      setAccounts(Array.isArray(payload?.data?.accounts) ? payload.data.accounts : []);
    } catch (error) {
      console.warn('[SponsorAuction] 연동 계정 조회 실패', error);
      showToast(error instanceof Error ? error.message : '연동 계정을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [ready, refresh, router, user]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    const timer = window.setTimeout(() => {
      void loadAccounts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAccounts, ready]);

  const handleLink = async (provider: SocialIdentityProvider) => {
    if (busyProvider) {
      return;
    }
    if (provider === 'phone') {
      setPhoneOpen(true);
      return;
    }
    setBusyProvider(provider);
    try {
      const result = await signInWithOAuth(provider, '/my/settings');
      if (result.error) {
        showToast(result.error);
      }
    } catch (error) {
      console.warn('[SponsorAuction] 소셜 연동 시작 실패', error);
      showToast('소셜 계정 연동을 시작하지 못했습니다.');
    } finally {
      setBusyProvider(null);
    }
  };

  const handleUnlink = async () => {
    if (!unlinkTarget) {
      return;
    }
    setBusyProvider(unlinkTarget);
    try {
      const response = await fetch(
        '/api/auth/identities/unlink',
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({ provider: unlinkTarget }),
        }),
      );
      const payload = (await response.json().catch(() => null)) as AccountsResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error || '연동을 해제하지 못했습니다.');
      }
      setAccounts(Array.isArray(payload?.data?.accounts) ? payload.data.accounts : []);
      showToast('연동을 해제했습니다.', 'success');
    } catch (error) {
      console.warn('[SponsorAuction] 소셜 연동 해제 실패', error);
      showToast(error instanceof Error ? error.message : '연동을 해제하지 못했습니다.');
    } finally {
      setBusyProvider(null);
      setUnlinkTarget(null);
    }
  };

  const handlePhoneLink = async () => {
    if (phoneBusy) {
      return;
    }
    setPhoneBusy(true);
    try {
      const response = await fetch(
        '/api/auth/identities/phone',
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({ phone }),
        }),
      );
      const payload = (await response.json().catch(() => null)) as AccountsResponse | null;
      if (!response.ok) {
        throw new Error(payload?.error || '휴대전화를 연동하지 못했습니다.');
      }
      setAccounts(Array.isArray(payload?.data?.accounts) ? payload.data.accounts : []);
      showToast('휴대전화를 연동했습니다.', 'success');
      setPhoneOpen(false);
      setPhone('');
    } catch (error) {
      console.warn('[SponsorAuction] 휴대전화 연동 실패', error);
      showToast(error instanceof Error ? error.message : '휴대전화를 연동하지 못했습니다.');
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) {
      return;
    }
    setDeleting(true);
    try {
      const response = await fetch(
        '/api/auth/account/delete',
        await authRequestInit({ method: 'POST' }),
      );
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || '회원 탈퇴를 완료하지 못했습니다.');
      }
      showToast('회원 탈퇴가 완료되었습니다.', 'success');
      window.location.replace('/');
    } catch (error) {
      console.warn('[SponsorAuction] 회원 탈퇴 실패', error);
      showToast(error instanceof Error ? error.message : '회원 탈퇴를 완료하지 못했습니다.');
      setDeleting(false);
    }
  };

  return (
    <div className="mt-8 flex min-w-0 flex-1 flex-col">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-bold text-zinc-950">연동된 계정</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Google, Kakao, Naver, Phone 연동 상태를 확인하고 추가로 연결하거나 해제할 수 있습니다.
        </p>

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            연동 상태를 확인하는 중...
          </div>
        ) : (
          <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {accounts.map((account) => (
              <li
                key={account.provider}
                className={cn(
                  'flex min-w-0 items-center justify-between gap-3 rounded-2xl border px-4 py-3',
                  providerButtonClass(account.provider, account.linked),
                )}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white/80">
                    <ProviderMark provider={account.provider} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-950">{account.label}</p>
                    <p className="truncate text-xs text-zinc-500">
                      {account.linked ? account.hint || '연동됨' : '미연동'}
                    </p>
                  </div>
                </div>
                {account.linked ? (
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      연동됨
                    </span>
                    <button
                      type="button"
                      disabled={!account.canUnlink || Boolean(busyProvider)}
                      title={
                        account.canUnlink
                          ? `${account.label} 연동 해제`
                          : '마지막 로그인 수단은 해제할 수 없습니다.'
                      }
                      onClick={() => setUnlinkTarget(account.provider)}
                      className="h-8 rounded-full border border-zinc-200 bg-white px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      연동 해제
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    disabled={Boolean(busyProvider)}
                    onClick={() => {
                      void handleLink(account.provider);
                    }}
                    className="h-8 shrink-0 rounded-full bg-zinc-950 px-3 text-xs font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyProvider === account.provider ? '연결 중...' : '연동하기'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

      </section>

      <div className="mt-auto flex justify-center pt-16 pb-2">
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          className="text-[11px] font-medium text-zinc-400 underline-offset-2 hover:text-zinc-500 hover:underline"
        >
          회원 탈퇴
        </button>
      </div>

      <ConfirmModal
        key={unlinkTarget ? `unlink-${unlinkTarget}` : 'unlink-closed'}
        open={Boolean(unlinkTarget)}
        title="연동을 해제할까요?"
        description="이 로그인 수단으로 더 이상 접속할 수 없습니다. 다른 연동 계정이 하나 이상 남아 있어야 합니다."
        confirmLabel="연동 해제"
        busyLabel="해제 중..."
        busy={Boolean(busyProvider)}
        onConfirm={() => {
          void handleUnlink();
        }}
        onClose={() => {
          if (!busyProvider) {
            setUnlinkTarget(null);
          }
        }}
      />

      <ConfirmModal
        key={deleteOpen ? 'delete-open' : 'delete-closed'}
        open={deleteOpen}
        title="정말 탈퇴할까요?"
        description="회원 탈퇴 시 계정, 소셜 연동, 프로필이 삭제되며 복구할 수 없습니다."
        confirmLabel="회원 탈퇴"
        busyLabel="탈퇴 처리 중..."
        danger
        busy={deleting}
        onConfirm={() => {
          void handleDelete();
        }}
        onClose={() => {
          if (!deleting) {
            setDeleteOpen(false);
          }
        }}
      />

      {phoneOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4"
              onClick={phoneBusy ? undefined : () => setPhoneOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative my-auto w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl max-h-[85vh]"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 id={titleId} className="text-base font-semibold text-zinc-950">
                    휴대전화 연동
                  </h2>
                  <button
                    type="button"
                    className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                    aria-label="닫기"
                    disabled={phoneBusy}
                    onClick={() => setPhoneOpen(false)}
                  >
                    <X className="size-5" />
                  </button>
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-600">
                  본인 확인용 휴대전화 번호를 등록하면 Phone 연동으로 표시됩니다.
                </p>
                <label className="mt-4 block text-sm font-medium text-zinc-800">
                  휴대전화
                  <input
                    type="tel"
                    inputMode="numeric"
                    placeholder="010-0000-0000"
                    value={phone}
                    disabled={phoneBusy}
                    onChange={(event) => setPhone(event.target.value)}
                    className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none ring-teal-700 focus:ring-2"
                  />
                </label>
                <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={() => setPhoneOpen(false)}
                    className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    disabled={phoneBusy}
                    onClick={() => {
                      void handlePhoneLink();
                    }}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
                  >
                    {phoneBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                    연동하기
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
