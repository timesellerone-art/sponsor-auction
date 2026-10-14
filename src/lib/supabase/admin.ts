import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { describeMissingPaymentEnv, getPaymentWriteEnv } from '@/lib/supabase/server-env';
import type { Database } from '@/types/database';

export function createPaymentDbClient() {
  const env = getPaymentWriteEnv();
  if (!env) {
    return {
      client: null,
      usingServiceRole: false as const,
      keySource: null as string | null,
      missing: describeMissingPaymentEnv(),
    };
  }

  const client = createClient<Database>(env.url, env.key, {
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
    usingServiceRole: env.usingServiceRole,
    keySource: env.keySource,
    missing: describeMissingPaymentEnv(),
  };
}
