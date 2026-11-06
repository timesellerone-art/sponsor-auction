import 'server-only';

import type { User } from '@supabase/supabase-js';
import { readBearerToken } from '@/lib/auth-request';
import { createClient } from '@/lib/supabase/server';

type AuthApiClient = Awaited<ReturnType<typeof createClient>>;

export async function getApiAuthUser(request: Request): Promise<{
  supabase: AuthApiClient;
  user: User | null;
  error: 'unconfigured' | 'unauthorized' | null;
}> {
  const supabase = await createClient();
  if (!supabase) {
    return { supabase: null, user: null, error: 'unconfigured' };
  }

  const bearer = readBearerToken(request.headers.get('authorization'));
  const { data, error } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser();
  if (error || !data.user) {
    return { supabase, user: null, error: 'unauthorized' };
  }
  return { supabase, user: data.user, error: null };
}
