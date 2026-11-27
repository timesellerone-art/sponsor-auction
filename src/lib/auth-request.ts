import { ACTIVE_ROLE_HEADER, readActiveRoleCookie } from '@/lib/access';
import { createClient } from '@/lib/supabase/client';

export function readBearerToken(authorization: string | null | undefined) {
  const match = authorization?.trim().match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? '';
}

async function accessTokenFromBrowserSession() {
  const supabase = createClient();
  if (!supabase) {
    return '';
  }
  try {
    const first = await supabase.auth.getSession();
    const existing = first.data.session?.access_token?.trim() ?? '';
    if (existing) {
      return existing;
    }
    await supabase.auth.getUser().catch(() => null);
    const retry = await supabase.auth.getSession();
    const retryToken = retry.data.session?.access_token?.trim() ?? '';
    if (retryToken) {
      return retryToken;
    }
    const refreshed = await supabase.auth.refreshSession().catch(() => null);
    return refreshed?.data.session?.access_token?.trim() ?? '';
  } catch {
    return '';
  }
}

export async function authRequestInit(init: RequestInit = {}): Promise<RequestInit> {
  const headers = new Headers(init.headers);
  const token = await accessTokenFromBrowserSession();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has(ACTIVE_ROLE_HEADER)) {
    const mode = readActiveRoleCookie();
    if (mode) {
      headers.set(ACTIVE_ROLE_HEADER, mode);
    }
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return {
    ...init,
    credentials: 'include',
    headers,
  };
}
