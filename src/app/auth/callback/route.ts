import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { sanitizeNextPath } from '@/lib/auth-guard';
import { getSupabaseEnv } from '@/lib/supabase/env';

function callbackOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    return `${forwardedProto === 'http' ? 'http' : 'https'}://${forwardedHost}`;
  }
  return url.origin;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const origin = callbackOrigin(request);
  const code = requestUrl.searchParams.get('code');
  const next = sanitizeNextPath(requestUrl.searchParams.get('next')) ?? '/';
  const oauthError =
    requestUrl.searchParams.get('error_description') ||
    requestUrl.searchParams.get('error');

  if (oauthError) {
    const login = new URL('/login', origin);
    login.searchParams.set('reason', 'auth-required');
    return NextResponse.redirect(login);
  }

  if (code) {
    const env = getSupabaseEnv();
    if (env) {
      const successRedirect = NextResponse.redirect(new URL(next, origin));
      const supabase = createServerClient(env.url, env.anonKey, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              request.cookies.set(name, value);
              successRedirect.cookies.set(name, value, options);
            });
          },
        },
      });

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return successRedirect;
      }
      console.warn('[SponsorAuction] OAuth 코드 교환에 실패했습니다.', error.message);
    }

    const clientFallback = new URL('/auth/oauth', origin);
    requestUrl.searchParams.forEach((value, key) => {
      clientFallback.searchParams.set(key, value);
    });
    return NextResponse.redirect(clientFallback);
  }

  const clientFallback = new URL('/auth/oauth', origin);
  const nextParam = requestUrl.searchParams.get('next');
  if (nextParam) {
    clientFallback.searchParams.set('next', nextParam);
  }
  return NextResponse.redirect(clientFallback);
}
