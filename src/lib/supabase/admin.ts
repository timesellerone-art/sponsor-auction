import { createClient } from '@supabase/supabase-js';
import { describeSupabaseServerEnv, getSupabaseAdminEnv } from '@/lib/supabase/env';
import type { Database } from '@/types/database';

export function createPaymentDbClient() {
  const env = getSupabaseAdminEnv();
  if (!env) {
    return {
      client: null,
      usingServiceRole: false as const,
      missing: describeSupabaseServerEnv(),
    };
  }

  const client = createClient<Database>(env.url, env.serviceRoleKey, {
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

  return {
    client,
    usingServiceRole: true as const,
    serviceRoleSource: env.serviceRoleSource,
    missing: describeSupabaseServerEnv(),
  };
}
