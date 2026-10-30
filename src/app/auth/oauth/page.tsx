'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { applyKnownSession, notifyAuthChanged } from '@/lib/auth';
import {
  ROLE_SELECT_PATH,
  describeOAuthError,
  oauthFailedLoginPath,
  postSocialAuthPath,
  sanitizeNextPath,
} from '@/lib/auth-guard';
import { sessionUserFromAuthUser } from '@/lib/auth-session';
import { AUTH_BOOT_TIMEOUT_MS } from '@/lib/auth-timeout';
import { getSupabaseClient } from '@/lib/supabase';
import { needsRoleOnboarding } from '@/types/auth';

function loginFallback(message?: string) {
  return oauthFailedLoginPath(describeOAuthError(message));
}

const completions = new Map<string, Promise<{ error: string | null; destination: string | null }>>();

async function verifyAndFinish(
  supabase: ReturnType<typeof getSupabaseClient>,
  tokenHash: string | null,
  type: 'magiclink' | 'email',
  next: string,
  alreadyLinked: boolean,
): Promise<{ error: string | null; destination: string | null }> {
  if (!supabase) {
    return { error: '로그인 세션이 저장되지 않았습니다. 다시 로그인해 주세요.', destination: null };
  }

  let authUser = (await supabase.auth.getSession()).data.session?.user ?? null;
  if (tokenHash) {
    const verified = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (verified.error || !verified.data.user) {
      console.warn('[SponsorAuction] 매직링크 세션 교환에 실패했습니다.', verified.error?.message);
      return {
        error: verified.error?.message || '로그인 세션이 저장되지 않았습니다. 다시 로그인해 주세요.',
        destination: null,
      };
    }
    authUser = verified.data.user;
  }
  if (!authUser) {
    return { error: '로그인 세션이 저장되지 않았습니다. 다시 로그인해 주세요.', destination: null };
  }
  if (!alreadyLinked) {
    const linked = await fetch('/api/auth/identities/link', {
      method: 'POST',
      credentials: 'include',
    });
    if (!linked.ok) {
      const payload = (await linked.json().catch(() => null)) as { error?: string } | null;
      return { error: payload?.error || '계정 통합에 실패했습니다.', destination: null };
    }
    const current = await supabase.auth.getSession();
    authUser = current.data.session?.user ?? authUser;
  }

  const session = sessionUserFromAuthUser(authUser);
  applyKnownSession(session);
  notifyAuthChanged();
  return {
    error: null,
    destination: postSocialAuthPath(session, next, {
      needsOnboarding: needsRoleOnboarding(session),
    }),
  };
}

function completeOnce(
  supabase: ReturnType<typeof getSupabaseClient>,
  tokenHash: string | null,
  type: 'magiclink' | 'email',
  next: string,
  alreadyLinked: boolean,
) {
  const key = `${tokenHash ?? 'session'}:${alreadyLinked ? '1' : '0'}`;
  let pending = completions.get(key);
  if (!pending) {
    pending = verifyAndFinish(supabase, tokenHash, type, next, alreadyLinked);
    completions.set(key, pending);
  }
  return pending;
}

export default function AuthOAuthCompletePage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let finished = false;

    const go = (path: string) => {
      if (cancelled || finished) {
        return;
      }
      finished = true;
      router.replace(path);
    };

    const timeout = window.setTimeout(() => {
      if (cancelled || finished) {
        return;
      }
      setFailed(true);
      showToast('로그인 확인이 지연되어 로그인 화면으로 이동합니다.');
      go(loginFallback('로그인 확인이 지연되었습니다.'));
    }, AUTH_BOOT_TIMEOUT_MS + 500);

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const tokenHash = params.get('token_hash');
      if (tokenHash) {
        window.location.replace(`/api/auth/session/complete?${params.toString()}`);
        return;
      }
      const next = sanitizeNextPath(params.get('next')) ?? ROLE_SELECT_PATH;
      const errorDescription =
        params.get('error_description') ||
        hashParams.get('error_description') ||
        params.get('error');

      if (errorDescription) {
        const message = decodeURIComponent(errorDescription.replace(/\+/g, ' '));
        showToast(message);
        go(loginFallback(message));
        return;
      }

      const supabase = getSupabaseClient();
      const otpType = params.get('type') === 'magiclink' ? 'magiclink' : 'email';
      const alreadyLinked = params.get('linked') === '1';

      try {
        const result = await completeOnce(supabase, null, otpType, next, alreadyLinked);
        if (result.error || !result.destination) {
          go(loginFallback(result.error ?? undefined));
          return;
        }
        go(result.destination);
      } catch (error) {
        console.warn('[SponsorAuction] OAuth 콜백 처리 중 예외가 발생했습니다.', error);
        showToast('소셜 로그인에 실패했습니다. 다시 시도해 주세요.');
        go(loginFallback('소셜 로그인에 실패했습니다. 다시 시도해 주세요.'));
      }
    };

    void finish();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16">
      <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
      <p className="mt-4 text-sm text-zinc-600">
        {failed ? '로그인 화면으로 이동합니다...' : '로그인 정보를 확인하고 있습니다...'}
      </p>
    </div>
  );
}
