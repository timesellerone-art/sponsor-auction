'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { getSessionUser, notifyAuthChanged } from '@/lib/auth';
import { ROLE_SELECT_PATH, postSocialAuthPath, sanitizeNextPath } from '@/lib/auth-guard';
import { AUTH_BOOT_TIMEOUT_MS } from '@/lib/auth-timeout';
import { getSupabaseClient } from '@/lib/supabase';
import { needsRoleOnboarding } from '@/types/auth';

function loginFallback(message?: string) {
  const params = new URLSearchParams();
  if (message) {
    params.set('oauth_error', message);
  }
  return `/login${params.toString() ? `?${params.toString()}` : ''}`;
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
      const code = params.get('code');
      const tokenHash = params.get('token_hash');
      const otpType = params.get('type') === 'magiclink' ? 'magiclink' : 'email';

      try {
        if (supabase && tokenHash) {
          const { error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: otpType,
          });
          if (error) {
            console.warn('[SponsorAuction] 매직링크 세션 교환에 실패했습니다.', error.message);
            showToast(error.message || '소셜 로그인에 실패했습니다.');
            go(loginFallback(error.message || '소셜 로그인에 실패했습니다.'));
            return;
          }
        } else if (supabase && code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.warn('[SponsorAuction] OAuth 세션 교환에 실패했습니다.', error.message);
            showToast(error.message || '소셜 로그인에 실패했습니다.');
            go(loginFallback(error.message || '소셜 로그인에 실패했습니다.'));
            return;
          }
        }

        notifyAuthChanged();
        await fetch('/api/auth/identities/link', {
          method: 'POST',
          credentials: 'include',
        }).catch(() => null);
        notifyAuthChanged();
        const session = await getSessionUser();
        const destination = postSocialAuthPath(session.data, next, {
          needsOnboarding: needsRoleOnboarding(session.data),
        });
        go(destination);
        router.refresh();
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
