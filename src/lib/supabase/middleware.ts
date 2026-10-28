import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { createCookieBag, writeCookies, type CookieToSet } from '@/lib/auth-paths';
import { getSupabaseEnv } from '@/lib/supabase/env';

export type SessionMiddlewareResult = {
  response: NextResponse;
  cookies: CookieToSet[];
};

export async function updateSession(request: NextRequest): Promise<SessionMiddlewareResult> {
  const bag = createCookieBag();
  let supabaseResponse = NextResponse.next({ request });
  const env = getSupabaseEnv();
  if (!env) {
    return { response: supabaseResponse, cookies: [] };
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        bag.remember(cookiesToSet);
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        writeCookies(supabaseResponse.cookies, cookiesToSet);
      },
    },
  });

  try {
    await supabase.auth.getUser();
  } catch (error) {
    console.warn('[SponsorAuction] 미들웨어 세션 갱신에 실패했습니다.', error);
  }

  return { response: supabaseResponse, cookies: bag.getAll() };
}

export function withSessionCookies(
  session: SessionMiddlewareResult,
  outgoing: NextResponse,
) {
  writeCookies(outgoing.cookies, session.cookies);
  return outgoing;
}
