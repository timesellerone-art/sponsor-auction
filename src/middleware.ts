import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_COOKIE_NAME } from '@/lib/access';
import { ROLE_SELECT_PATH } from '@/lib/auth-guard';
import {
  expireAuthDebrisCookies,
  hasAuthPresence,
  isAuthCallbackPath,
  isAuthPassthroughPath,
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

  if (pathname === '/auth/oauth' && request.nextUrl.searchParams.has('token_hash')) {
    const complete = request.nextUrl.clone();
    complete.pathname = '/api/auth/session/complete';
    return NextResponse.rewrite(complete);
  }

  if (request.nextUrl.searchParams.has('error_code')) {
    const callback = request.nextUrl.clone();
    callback.pathname = '/auth/callback';
    return NextResponse.redirect(callback);
  }

  const session = await updateSession(request);
  const cookieRoles = parseAuthRoles(request.cookies.get(ROLE_COOKIE_NAME)?.value ?? '');
  const hasAdmin = cookieRoles.includes('admin');
  const hasAdvertiser = cookieRoles.includes('advertiser');
  const hasCreator = cookieRoles.includes('creator');
  const hasMemberRole = hasAdmin || hasAdvertiser || hasCreator;
  const loggedIn = hasAuthPresence(request.cookies.getAll());

  if (shouldRateLimitPath(pathname) && request.method !== 'OPTIONS') {
    const limited = consumeRateLimit(clientIp(request), pathname);
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }
  }

  const onboardingPath = onboardingCanonicalPath(pathname);
  if (onboardingPath) {
    return finish(request, withSessionCookies(session, redirectTo(request, onboardingPath)));
  }

  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isDashboardPath = pathname === '/my' || pathname.startsWith('/my/');
  const isPaymentPath = pathname === '/payments' || pathname.startsWith('/payments/');
  const needsRole = loggedIn && !hasMemberRole;

  if (needsRole && (pathname.startsWith('/login') || !isAuthPassthroughPath(pathname))) {
    return finish(request, withSessionCookies(session, redirectTo(request, ROLE_SELECT_PATH)));
  }

  if (pathname.startsWith('/onboarding') && hasMemberRole) {
    return finish(
      request,
      withSessionCookies(session, redirectTo(request, hasAdmin ? '/admin' : '/my')),
    );
  }

  if (isAdminPath && !hasAdmin) {
    return finish(
      request,
      withSessionCookies(
        session,
        redirectTo(
          request,
          hasMemberRole ? '/' : '/login',
          hasMemberRole ? 'admin-forbidden' : 'admin-auth',
        ),
      ),
    );
  }

  if (isDashboardPath && !hasAdvertiser && !hasCreator) {
    if (loggedIn && !hasMemberRole) {
      return finish(request, withSessionCookies(session, redirectTo(request, ROLE_SELECT_PATH)));
    }
    return finish(
      request,
      withSessionCookies(
        session,
        redirectTo(
          request,
          hasMemberRole ? '/' : '/login',
          hasMemberRole ? 'advertiser-forbidden' : 'advertiser-auth',
        ),
      ),
    );
  }

  if (isPaymentPath && !hasAdvertiser && !hasCreator && !hasAdmin) {
    if (loggedIn && !hasMemberRole) {
      return finish(request, withSessionCookies(session, redirectTo(request, ROLE_SELECT_PATH)));
    }
    return finish(
      request,
      withSessionCookies(
        session,
        redirectTo(
          request,
          hasMemberRole ? '/' : '/login',
          hasMemberRole ? 'advertiser-forbidden' : 'payment-auth',
        ),
      ),
    );
  }

  return finish(request, session.response);
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/auth/callback',
    '/auth/oauth',
    '/onboarding',
    '/onboarding/:path*',
    '/select-role',
    '/auctions/:path*',
    '/inventory',
    '/inventory/:path*',
    '/admin',
    '/admin/:path*',
    '/my',
    '/my/:path*',
    '/payments',
    '/payments/:path*',
    '/api/auctions',
    '/api/auctions/:path*',
    '/api/bids',
    '/api/bids/:path*',
    '/api/timeslots',
    '/api/timeslots/:path*',
    '/api/chat',
    '/api/chat/:path*',
    '/api/payments/:path*',
    '/api/admin/:path*',
    '/api/ai-analyze',
    '/api/notifications/:path*',
    '/api/auth/naver',
    '/api/auth/naver/:path*',
    '/api/onboarding/:path*',
  ],
};
