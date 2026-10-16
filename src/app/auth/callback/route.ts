import { NextResponse } from 'next/server';
import { sanitizeNextPath } from '@/lib/auth-guard';
import { createClient } from '@/lib/supabase/server';

function callbackOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    return `${forwardedProto === 'http' ? 'http' : 'https'}://${forwardedHost}`;
  }
  return url.origin;
}

export async function GET(request: Request) {
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
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return NextResponse.redirect(new URL(next, origin));
      }
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
