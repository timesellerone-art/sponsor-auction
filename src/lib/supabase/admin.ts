import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { describeMissingPaymentEnv, getPaymentWriteEnv } from '@/lib/supabase/server-env';
import type { Database } from '@/types/database';

function jwtRole(token: string) {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { role?: string };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function createAdminClient() {
  const url = (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  )
    .trim()
    .replace(/\/$/, '');
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim();
  const role = jwtRole(key);

  if (!url || key.length < 20) {
    console.error('[SponsorAuction] createAdminClient 실패: URL 또는 SUPABASE_SERVICE_ROLE_KEY 없음', {
      hasUrl: Boolean(url),
      serviceRoleLength: (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim().length,
    });
    return null;
  }

  if (role === 'anon' || role === 'authenticated') {
    console.error('[SponsorAuction] createAdminClient 실패: service_role JWT가 아닙니다', { role });
    return null;
  }

  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        'x-client-info': 'sponsor-auction-admin',
      },
    },
  });
}

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
