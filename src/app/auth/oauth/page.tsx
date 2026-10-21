'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { getSessionUser, notifyAuthChanged } from '@/lib/auth';
import { postAuthPath, sanitizeNextPath } from '@/lib/auth-guard';
import { getSupabaseClient } from '@/lib/supabase';

export default function AuthOAuthCompletePage() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const params = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const next = sanitizeNextPath(params.get('next')) ?? '/';
      const errorDescription =
        params.get('error_description') ||
        hashParams.get('error_description') ||
        params.get('error');

      if (errorDescription) {
        showToast(decodeURIComponent(errorDescription.replace(/\+/g, ' ')));
        router.replace('/login?reason=auth-required');
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
            router.replace('/login?reason=auth-required');
            return;
          }
        } else if (supabase && code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.warn('[SponsorAuction] OAuth 세션 교환에 실패했습니다.', error.message);
            showToast(error.message || '소셜 로그인에 실패했습니다.');
            router.replace('/login?reason=auth-required');
            return;
          }
        }

        notifyAuthChanged();
        const session = await getSessionUser();
        const destination = postAuthPath(session.data?.role ?? null, next);
        if (!cancelled) {
          router.replace(destination);
          router.refresh();
        }
      } catch (error) {
        console.warn('[SponsorAuction] OAuth 콜백 처리 중 예외가 발생했습니다.', error);
        showToast('소셜 로그인에 실패했습니다. 다시 시도해 주세요.');
        router.replace('/login?reason=auth-required');
      }
    };

    void finish();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16">
      <Loader2 className="size-6 animate-spin text-teal-700" aria-hidden />
      <p className="mt-4 text-sm text-zinc-600">로그인 정보를 확인하고 있습니다...</p>
    </div>
  );
}
