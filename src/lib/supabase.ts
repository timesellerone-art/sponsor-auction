import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv, warnMockFallback } from '@/lib/supabase/env';
import type { Database } from '@/types/database';

export type SponsorAuctionClient = SupabaseClient<Database>;

let singleton: SponsorAuctionClient | null | undefined;

/**
 * `@supabase/supabase-js` 싱글톤 클라이언트.
 * `.env.local`의 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY를 사용합니다.
 * (JWT anon key 또는 sb_publishable_ 키 모두 허용)
 */
export function getSupabaseClient(): SponsorAuctionClient | null {
  if (singleton !== undefined) {
    return singleton;
  }

  const env = getSupabaseEnv();
  if (!env) {
    warnMockFallback();
    singleton = null;
    return null;
  }

  try {
    singleton = createClient<Database>(env.url, env.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'sponsor-auction-supabase-auth',
      },
      global: {
        headers: {
          'x-client-info': 'sponsor-auction',
        },
      },
    });
    return singleton;
  } catch (error) {
    console.error(
      '[SponsorAuction] Supabase 싱글톤 클라이언트를 생성하지 못했습니다.',
      error,
    );
    singleton = null;
    return null;
  }
}

export function isSupabaseConfigured() {
  return getSupabaseEnv() !== null;
}
