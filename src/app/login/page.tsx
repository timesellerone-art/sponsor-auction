'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AgreementFields } from '@/components/AgreementFields';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { SIGNUP_AGREEMENT_REQUIRED, validateSignupAgreement } from '@/lib/legal';
import {
  AUTH_FAIL_MESSAGE,
  getSessionUser,
  signIn,
  signInWithOAuth,
  signUp,
  type SocialOAuthProvider,
} from '@/lib/auth';
import { postAuthPath, sanitizeNextPath } from '@/lib/auth-guard';
import { cn } from '@/lib/utils';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, refresh } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<SocialOAuthProvider | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreementErrors, setAgreementErrors] = useState<{
    agreeTerms?: string;
    agreePrivacy?: string;
  }>({});

  const destinationAfterLogin = (role: string | null) => {
    const params = new URLSearchParams(window.location.search);
    return postAuthPath(role, params.get('next'));
  };

  useEffect(() => {
    const oauthError = new URLSearchParams(window.location.search).get('oauth_error');
    if (oauthError) {
      showToast(oauthError);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (!cancelled) {
        setIsLoading(false);
      }
    }, 4000);

    const checkSession = async () => {
      try {
        const result = await getSessionUser();
        if (cancelled) {
          return;
        }
        const sessionUser = result.data;
        if (sessionUser) {
          router.replace(destinationAfterLogin(sessionUser.role));
        }
      } catch (sessionError) {
        console.warn('[SponsorAuction] 로그인 페이지 세션 확인에 실패했습니다.', sessionError);
      } finally {
        window.clearTimeout(timeoutId);
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void checkSession();
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  useEffect(() => {
    if (isLoading || !ready || !user) {
      return;
    }
    router.replace(destinationAfterLogin(user.role));
  }, [isLoading, ready, router, user]);

  const ensureSignupAgreements = () => {
    if (mode !== 'signup') {
      return true;
    }
    const nextErrors = validateSignupAgreement(agreeTerms && agreePrivacy);
    setAgreementErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const message = nextErrors.agreeTerms ?? SIGNUP_AGREEMENT_REQUIRED;
      showToast(message);
      return false;
    }
    return true;
  };

  const handleOAuth = async (provider: SocialOAuthProvider) => {
    if (submitting || oauthBusy) {
      return;
    }
    if (!ensureSignupAgreements()) {
      return;
    }
    setOauthBusy(provider);
    setError(null);
    try {
      const next = sanitizeNextPath(
        new URLSearchParams(window.location.search).get('next'),
      );
      const result = await signInWithOAuth(provider, next);
      if (result.error) {
        setError(result.error);
        showToast(result.error);
      }
    } catch {
      setError(AUTH_FAIL_MESSAGE);
      showToast(AUTH_FAIL_MESSAGE);
    } finally {
      setOauthBusy(null);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (!ensureSignupAgreements()) {
        return;
      }
      const result =
        mode === 'signup'
          ? await signUp({ name, email, password })
          : await signIn({ email, password });

      if (result.error || !result.data) {
        const message = result.error ?? AUTH_FAIL_MESSAGE;
        setError(message);
        showToast(message);
        return;
      }

      showToast(
        mode === 'signup' ? '가입되었습니다. 역할을 선택해 주세요.' : '로그인했습니다.',
        'success',
      );
      await refresh();
      router.replace(destinationAfterLogin(result.data.role));
      router.refresh();
    } catch {
      setError(AUTH_FAIL_MESSAGE);
      showToast(AUTH_FAIL_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      aria-busy={isLoading}
      className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center px-4 py-10 sm:px-6"
    >
      <p className="text-sm font-semibold tracking-wide text-teal-800">Account</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-950">
        {mode === 'signup' ? '회원가입' : '로그인'}
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        광고주 또는 크리에이터로 시작한 뒤, 역할에 맞는 메뉴를 사용할 수 있습니다.
      </p>

      <div className="mt-6 flex gap-1 rounded-full bg-zinc-100 p-1">
        <button
          type="button"
          onClick={() => setMode('signin')}
          className={cn(
            'h-9 flex-1 rounded-full text-sm font-semibold',
            mode === 'signin' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500',
          )}
        >
          로그인
        </button>
        <button
          type="button"
          onClick={() => setMode('signup')}
          className={cn(
            'h-9 flex-1 rounded-full text-sm font-semibold',
            mode === 'signup' ? 'bg-white text-zinc-950 shadow-sm' : 'text-zinc-500',
          )}
        >
          회원가입
        </button>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
        noValidate
      >
        {mode === 'signup' ? (
          <label className="block text-sm font-medium text-zinc-800">
            이름
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
              placeholder="홍길동"
              autoComplete="name"
            />
          </label>
        ) : null}

        <label className={cn('block text-sm font-medium text-zinc-800', mode === 'signup' ? 'mt-4' : '')}>
          이메일
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            placeholder="you@example.com"
            autoComplete="email"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-zinc-800">
          비밀번호
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1.5 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            placeholder="6자 이상"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          />
        </label>

        {error ? (
          <p className="mt-3 text-xs text-rose-600" role="alert">
            {error}
          </p>
        ) : (
          <p className="mt-3 text-xs text-zinc-400">
            개발용 계정: brand@demo.com / creator@demo.com / admin@demo.com
            (비밀번호 demo1234)
          </p>
        )}

        {mode === 'signup' ? (
          <div className="mt-4">
            <AgreementFields
              variant="combined"
              agreeTerms={agreeTerms}
              agreePrivacy={agreePrivacy}
              onTermsChange={setAgreeTerms}
              onPrivacyChange={setAgreePrivacy}
              termsError={agreementErrors.agreeTerms}
              privacyError={agreementErrors.agreePrivacy}
            />
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || Boolean(oauthBusy)}
          className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {mode === 'signup' ? '가입하고 역할 선택' : '로그인'}
        </button>

        <div className="mt-5 flex items-center gap-3">
          <span className="h-px flex-1 bg-zinc-200" />
          <span className="text-xs text-zinc-400">또는 소셜 로그인</span>
          <span className="h-px flex-1 bg-zinc-200" />
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            disabled={submitting || Boolean(oauthBusy)}
            onClick={() => {
              void handleOAuth('google');
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {oauthBusy === 'google' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <GoogleMark />
            )}
            Google로 계속하기
          </button>
          <button
            type="button"
            disabled={submitting || Boolean(oauthBusy)}
            onClick={() => {
              void handleOAuth('kakao');
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-[#FEE500] text-sm font-semibold text-zinc-900 hover:bg-[#f5dc00] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {oauthBusy === 'kakao' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <KakaoMark />
            )}
            카카오로 계속하기
          </button>
          <button
            type="button"
            disabled={submitting || Boolean(oauthBusy)}
            onClick={() => {
              void handleOAuth('naver');
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#03C75A] text-sm font-semibold text-white hover:bg-[#02b351] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {oauthBusy === 'naver' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <NaverMark />
            )}
            네이버로 계속하기
          </button>
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Apple 로그인은 잠시 비활성화되어 있습니다."
            className="inline-flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-zinc-950 text-sm font-semibold text-white opacity-50"
          >
            <AppleMark />
            Apple로 계속하기
          </button>
        </div>
      </form>

      <p className="mt-4 text-center text-sm text-zinc-500">
        <Link href="/" className="font-medium text-teal-800 hover:underline">
          홈으로 돌아가기
        </Link>
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
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

function KakaoMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#191919"
        d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.86 5.33 4.66 6.74L5.7 21.3c-.14.5.45.9.86.58l3.94-2.64c.48.07.97.1 1.5.1 5.52 0 10-3.58 10-8s-4.48-8-10-8z"
      />
    </svg>
  );
}

function NaverMark() {
  return (
    <span className="flex size-5 items-center justify-center rounded-sm bg-white text-[11px] font-black leading-none text-[#03C75A]">
      N
    </span>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 fill-white" aria-hidden>
      <path d="M16.37 12.64c-.03-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.71-3.18-1.73-1.35-.14-2.64.79-3.33.79-.69 0-1.75-.77-2.88-.75-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.61 1.11 8.77.73 1.06 1.6 2.24 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.88.68 1.19-.02 1.94-1.08 2.66-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.51zM14.6 6.3c.6-.73 1.01-1.74.9-2.75-.87.03-1.92.58-2.54 1.31-.56.65-1.05 1.7-.92 2.69 1.03.08 2.08-.52 2.56-1.25z" />
    </svg>
  );
}
