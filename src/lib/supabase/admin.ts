import { createClient } from '@supabase/supabase-js';
import { getSupabaseEnv } from '@/lib/supabase/env';
import type { Database } from '@/types/database';

function trimKey(value: string | undefined) {
  return value?.trim().replace(/^["']+|["']+$/g, '') || '';
}

export function createPaymentDbClient() {
  const env = getSupabaseEnv();
  if (!env) {
    return { client: null, usingServiceRole: false as const };
  }

  const serviceRoleKey = trimKey(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const key = serviceRoleKey || env.anonKey;
  const client = createClient<Database>(env.url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-client-info': 'sponsor-auction-payments',
      },
    },
  });

  return { client, usingServiceRole: Boolean(serviceRoleKey) };
}
