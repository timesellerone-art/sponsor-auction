import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_COOKIE_NAME } from '@/lib/access';
import { POST_AUTH_HOME } from '@/lib/auth-guard';
import {
  expireAuthDebrisCookies,
  hasAuthPresence,
  isAuthCallbackPath,
  isAuthPassthroughPath,
  needsProtectedAuthValidation,
  onboardingCanonicalPath,
} from '@/lib/auth-paths';
import { parseAuthRoles } from '@/types/auth';
import { updateSession, withSessionCookies } from '@/lib/supabase/middleware';
import {
  clientIp,
  consumeRateLimit,
  rateLimitResponse,
  shouldRateLimitPath,
} from '@/lib/rate-limit';

function finish(request: NextRequest, response: NextResponse) {
  expireAuthDebrisCookies(request, response);
  return response;
}

function redirectTo(request: NextRequest, pathname: string, reason?: string) {
  const url = request.nextUrl.clone();
  const nextPath = request.nextUrl.pathname;
  url.pathname = pathname;
  url.search = '';
  if (reason) {
    url.searchParams.set('reason', reason);
  }
  if (pathname === '/login' && nextPath.startsWith('/') && !isAuthPassthroughPath(nextPath)) {
    url.searchParams.set('next', nextPath);
  }
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isAuthCallbackPath(pathname)) {
    return NextResponse.next();
  }

  if (
    pathname === '/auth/oauth' &&
    request.nextUrl.searchParams.has('token_hash') &&
    request.nextUrl.searchParams.get('client') !== '1'
  ) {
    const complete = request.nextUrl.clone();
    complete.pathname = '/api/auth/session/complete';
    return NextResponse.redirect(complete);
  }

  if (request.nextUrl.searchParams.has('error_code')) {
    const callback = request.nextUrl.clone();
    callback.pathname = '/auth/callback';
    return NextResponse.redirect(callback);
  }

  const session = await updateSession(request, {
    validate: needsProtectedAuthValidation(pathname),
  });
  const cookieRoles = parseAuthRoles(request.cookies.get(ROLE_COOKIE_NAME)?.value ?? '');
  const hasAdmin = cookieRoles.includes('admin');
  const hasAdvertiser = cookieRoles.includes('advertiser');
  const hasCreator = cookieRoles.includes('creator');
  const loggedIn = hasAuthPresence(request.cookies.getAll());

  if (shouldRateLimitPath(pathname) && request.method !== 'OPTIONS') {
    const limited = consumeRateLimit(clientIp(request), pathname);
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }
  }

  const loginError = request.nextUrl.searchParams.get('error');
  if (
    pathname.startsWith('/login') &&
    loggedIn &&
    (loginError === 'oauth_failed' || loginError === 'oauth_retry')
  ) {
    return finish(request, withSessionCookies(session, redirectTo(request, POST_AUTH_HOME)));
  }

  const onboardingPath = onboardingCanonicalPath(pathname);
  if (onboardingPath) {
    return finish(request, withSessionCookies(session, redirectTo(request, onboardingPath)));
  }

  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isDashboardPath = pathname === '/my' || pathname.startsWith('/my/');
  const isPaymentPath = pathname === '/payments' || pathname.startsWith('/payments/');

  if (isAdminPath && !hasAdmin) {
    return finish(
      request,
      withSessionCookies(
        session,
        redirectTo(
          request,
          loggedIn ? '/' : '/login',
          loggedIn ? 'admin-forbidden' : 'admin-auth',
        ),
      ),
    );
  }

  if (isDashboardPath && !loggedIn) {
    return finish(
      request,
      withSessionCookies(session, redirectTo(request, '/login', 'advertiser-auth')),
    );
  }

  if (isPaymentPath && !hasAdvertiser && !hasCreator && !hasAdmin) {
    return finish(
      request,
      withSessionCookies(
        session,
        redirectTo(
          request,
          loggedIn ? '/' : '/login',
          loggedIn ? 'advertiser-forbidden' : 'payment-auth',
        ),
      ),
    );
  }

  return finish(request, session.response);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
