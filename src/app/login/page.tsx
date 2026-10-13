'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { AgreementFields } from '@/components/AgreementFields';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { validateAgreements } from '@/lib/legal';
import {
  AUTH_FAIL_MESSAGE,
  signIn,
  signInWithGoogle,
  signInWithKakao,
  signUp,
} from '@/lib/auth';
import { sanitizeNextPath } from '@/lib/auth-guard';
import { cn } from '@/lib/utils';

type Mode = 'signin' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [oauthBusy, setOauthBusy] = useState<'google' | 'kakao' | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const [agreementErrors, setAgreementErrors] = useState<{
    agreeTerms?: string;
    agreePrivacy?: string;
  }>({});

  const destinationAfterLogin = (role: string | null) => {
    const params = new URLSearchParams(window.location.search);
    const next = sanitizeNextPath(params.get('next'));
    if (next) {
      return next;
    }
    const reason = params.get('reason');
    if (role === 'admin' && reason?.startsWith('admin')) {
      return '/admin';
    }
    if (role === 'advertiser' && reason?.startsWith('advertiser')) {
      return '/my';
    }
    return '/';
  };

  useEffect(() => {
    if (!ready || !user) {
      return;
    }
    router.replace(destinationAfterLogin(user.role));
  }, [ready, router, user]);

  const ensureSignupAgreements = () => {
    if (mode !== 'signup') {
      return true;
    }
    const nextErrors = validateAgreements({ agreeTerms, agreePrivacy });
    setAgreementErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      const message = nextErrors.agreeTerms ?? nextErrors.agreePrivacy ?? '약관에 동의해 주세요.';
      setError(message);
      showToast(message);
      return false;
    }
    return true;
  };

  const handleOAuth = async (provider: 'google' | 'kakao') => {
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
      const result =
        provider === 'google'
          ? await signInWithGoogle(next)
          : await signInWithKakao(next);
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
      router.push(destinationAfterLogin(result.data.role));
      router.refresh();
    } catch {
      setError(AUTH_FAIL_MESSAGE);
      showToast(AUTH_FAIL_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-md min-w-0 flex-1 flex-col justify-center px-4 py-10 sm:px-6">
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
            ) : null}
            Google로 계속하기
          </button>
          <button
            type="button"
            disabled={submitting || Boolean(oauthBusy)}
            onClick={() => {
              void handleOAuth('kakao');
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {oauthBusy === 'kakao' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            카카오로 계속하기
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
