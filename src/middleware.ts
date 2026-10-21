import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_PRESENT_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/access';
import { ROLE_SELECT_PATH } from '@/lib/auth-guard';
import { parseAuthRoles } from '@/types/auth';
import { updateSession, withSessionCookies } from '@/lib/supabase/middleware';
import {
  clientIp,
  consumeRateLimit,
  rateLimitResponse,
  shouldRateLimitPath,
} from '@/lib/rate-limit';

function redirectTo(request: NextRequest, pathname: string, reason?: string) {
  const url = request.nextUrl.clone();
  const nextPath = request.nextUrl.pathname;
  url.pathname = pathname;
  url.search = '';
  if (reason) {
    url.searchParams.set('reason', reason);
  }
  if (pathname === '/login' && nextPath.startsWith('/')) {
    url.searchParams.set('next', nextPath);
  }
  return NextResponse.redirect(url);
}

function isOnboardingOpenPath(pathname: string) {
  return (
    pathname === ROLE_SELECT_PATH ||
    pathname.startsWith('/onboarding') ||
    pathname.startsWith('/api/onboarding') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/refund'
  );
}

export async function middleware(request: NextRequest) {
  const sessionResponse = await updateSession(request);
  const cookieRoles = parseAuthRoles(request.cookies.get(ROLE_COOKIE_NAME)?.value ?? '');
  const hasAdmin = cookieRoles.includes('admin');
  const hasAdvertiser = cookieRoles.includes('advertiser');
  const hasCreator = cookieRoles.includes('creator');
  const hasMemberRole = hasAdmin || hasAdvertiser || hasCreator;
  const loggedIn = request.cookies.get(AUTH_PRESENT_COOKIE_NAME)?.value === '1';
  const pathname = request.nextUrl.pathname;

  if (shouldRateLimitPath(pathname) && request.method !== 'OPTIONS') {
    const limited = consumeRateLimit(clientIp(request), pathname);
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }
  }

  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isDashboardPath = pathname === '/my' || pathname.startsWith('/my/');
  const isPaymentPath = pathname === '/payments' || pathname.startsWith('/payments/');
  const needsRole = loggedIn && !hasMemberRole;

  const loginAuthRequired =
    pathname.startsWith('/login') &&
    request.nextUrl.searchParams.get('reason') === 'auth-required';

  if (
    needsRole &&
    !loginAuthRequired &&
    (pathname.startsWith('/login') || !isOnboardingOpenPath(pathname))
  ) {
    return withSessionCookies(sessionResponse, redirectTo(request, ROLE_SELECT_PATH));
  }

  if (pathname.startsWith('/onboarding') && hasMemberRole) {
    return withSessionCookies(
      sessionResponse,
      redirectTo(request, hasAdmin ? '/admin' : '/my'),
    );
  }

  if (isAdminPath && !hasAdmin) {
    return withSessionCookies(
      sessionResponse,
      redirectTo(
        request,
        hasMemberRole ? '/' : '/login',
        hasMemberRole ? 'admin-forbidden' : 'admin-auth',
      ),
    );
  }

  if (isDashboardPath && !hasAdvertiser && !hasCreator) {
    if (loggedIn && !hasMemberRole) {
      return withSessionCookies(sessionResponse, redirectTo(request, ROLE_SELECT_PATH));
    }
    return withSessionCookies(
      sessionResponse,
      redirectTo(
        request,
        hasMemberRole ? '/' : '/login',
        hasMemberRole ? 'advertiser-forbidden' : 'advertiser-auth',
      ),
    );
  }

  if (isPaymentPath && !hasAdvertiser && !hasCreator && !hasAdmin) {
    if (loggedIn && !hasMemberRole) {
      return withSessionCookies(sessionResponse, redirectTo(request, ROLE_SELECT_PATH));
    }
    return withSessionCookies(
      sessionResponse,
      redirectTo(
        request,
        hasMemberRole ? '/' : '/login',
        hasMemberRole ? 'advertiser-forbidden' : 'payment-auth',
      ),
    );
  }

  return sessionResponse;
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/auth/callback',
    '/auth/oauth',
    '/onboarding',
    '/onboarding/:path*',
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
