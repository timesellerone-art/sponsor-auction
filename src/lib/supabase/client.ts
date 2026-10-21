import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseEnv, warnMockFallback } from '@/lib/supabase/env';
import type { Database } from '@/types/database';
import type { SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient<Database> | null | undefined;

/**
 * 브라우저용 Supabase 클라이언트.
 * `@supabase/ssr`가 PKCE verifier와 세션을 쿠키에 저장하므로
 * `/auth/callback` 서버 교환과 같은 저장소를 사용합니다.
 */
export function createClient(): SupabaseClient<Database> | null {
  if (browserClient !== undefined) {
    return browserClient;
  }

  const env = getSupabaseEnv();
  if (!env) {
    warnMockFallback();
    browserClient = null;
    return null;
  }

  try {
    browserClient = createBrowserClient<Database>(env.url, env.anonKey, {
      isSingleton: true,
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
      },
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return browserClient;
  } catch (error) {
    console.error(
      '[SponsorAuction] Supabase 브라우저 클라이언트를 생성하지 못했습니다.',
      error,
    );
    browserClient = null;
    return null;
  }
}

export function getSupabaseClient(): SupabaseClient<Database> | null {
  return createClient();
}
