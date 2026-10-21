import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';
import type { Database } from '@/types/database';

export type SponsorAuctionClient = SupabaseClient<Database>;

export { getSupabaseClient } from '@/lib/supabase/client';

export function isSupabaseConfigured() {
  return getSupabaseEnv() !== null;
}
