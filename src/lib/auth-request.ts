import { ACTIVE_ROLE_HEADER, readActiveRoleCookie } from '@/lib/access';
import { createClient } from '@/lib/supabase/client';

export function readBearerToken(authorization: string | null | undefined) {
  const match = authorization?.trim().match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? '';
}

export async function authRequestInit(init: RequestInit = {}): Promise<RequestInit> {
  const headers = new Headers(init.headers);
  const supabase = createClient();
  if (supabase) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token?.trim();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    } catch {
      // 쿠키 세션만으로도 호출할 수 있습니다.
    }
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
