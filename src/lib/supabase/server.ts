import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseEnv, warnMockFallback } from '@/lib/supabase/env';
import type { Database } from '@/types/database';

export async function createClient() {
  const env = getSupabaseEnv();

  if (!env) {
    warnMockFallback();
    return null;
  }

  try {
    const cookieStore = await cookies();

    return createServerClient<Database>(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component에서 set이 호출되면 무시합니다.
          }
        },
      },
    });
  } catch (error) {
    console.warn(
      '[SponsorAuction] Supabase 서버 클라이언트를 만들지 못했습니다. Mock 데이터로 전환합니다.',
      error,
    );
    return null;
  }
}
