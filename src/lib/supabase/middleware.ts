import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  createCookieBag,
  sessionCookieOptions,
  shouldApplyRequestCookie,
  writeCookies,
  type CookieToSet,
} from '@/lib/auth-paths';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { requestAppOrigin } from '@/lib/site-origin';

export type SessionMiddlewareResult = {
  response: NextResponse;
  cookies: CookieToSet[];
  secure: boolean;
};

export async function updateSession(request: NextRequest): Promise<SessionMiddlewareResult> {
  const bag = createCookieBag();
  const origin = requestAppOrigin(request);
  const secure = origin.startsWith('https://');
  const cookieOptions = sessionCookieOptions(secure, new URL(origin).hostname);
  let supabaseResponse = NextResponse.next({ request });
  const env = getSupabaseEnv();
  if (!env) {
    return { response: supabaseResponse, cookies: [], secure };
  }

  const supabase = createServerClient(env.url, env.anonKey, {
    cookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        const keepers = cookiesToSet.filter(({ name, value }) =>
          shouldApplyRequestCookie(name, value),
        );
        bag.remember(keepers);
        keepers.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        writeCookies(supabaseResponse.cookies, keepers, {
          secure,
          maxAge: cookieOptions.maxAge,
        });
      },
    },
  });

  try {
    // getUser() validates the JWT and rotates refreshed tokens onto setAll cookies.
    await supabase.auth.getUser();
  } catch (error) {
    console.warn('[SponsorAuction] 미들웨어 세션 갱신에 실패했습니다.', error);
  }

  return { response: supabaseResponse, cookies: bag.getAll(), secure };
}

export function withSessionCookies(
  session: SessionMiddlewareResult,
  outgoing: NextResponse,
) {
  writeCookies(outgoing.cookies, session.cookies, {
    secure: session.secure,
    maxAge: sessionCookieOptions(session.secure).maxAge,
  });
  return outgoing;
}
