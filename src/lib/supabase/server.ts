import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { sessionCookieOptions } from '@/lib/auth-paths';
import { getSupabaseEnv, warnMockFallback } from '@/lib/supabase/env';
import { hostnameOf } from '@/lib/site-origin';
import type { Database } from '@/types/database';

export async function createClient() {
  const env = getSupabaseEnv();

  if (!env) {
    warnMockFallback();
    return null;
  }

  try {
    const cookieStore = await cookies();
    const headerStore = await headers();
    const host = headerStore.get('x-forwarded-host') || headerStore.get('host') || '';

    return createServerClient<Database>(env.url, env.anonKey, {
      cookieOptions: sessionCookieOptions(undefined, hostnameOf(host)),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, {
                ...options,
                path: options?.path ?? '/',
                sameSite: options?.sameSite ?? 'lax',
              });
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
