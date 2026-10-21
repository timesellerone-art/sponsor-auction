import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_PRESENT_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/access';
import { ROLE_SELECT_PATH } from '@/lib/auth-guard';
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
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/refund'
  );
}

export async function middleware(request: NextRequest) {
  const sessionResponse = await updateSession(request);
  const role = request.cookies.get(ROLE_COOKIE_NAME)?.value ?? '';
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
  const needsRole = loggedIn && role !== 'admin' && role !== 'advertiser' && role !== 'creator';

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

  if (pathname.startsWith('/onboarding') && role) {
    return withSessionCookies(
      sessionResponse,
      redirectTo(request, role === 'admin' ? '/admin' : '/my'),
    );
  }

  if (isAdminPath && role !== 'admin') {
    return withSessionCookies(
      sessionResponse,
      redirectTo(
        request,
        role ? '/' : '/login',
        role ? 'admin-forbidden' : 'admin-auth',
      ),
    );
  }

  if (isDashboardPath && role !== 'advertiser' && role !== 'creator') {
    if (loggedIn && !role) {
      return withSessionCookies(sessionResponse, redirectTo(request, ROLE_SELECT_PATH));
    }
    return withSessionCookies(
      sessionResponse,
      redirectTo(
        request,
        role ? '/' : '/login',
        role ? 'advertiser-forbidden' : 'advertiser-auth',
      ),
    );
  }

  if (
    isPaymentPath &&
    role !== 'advertiser' &&
    role !== 'creator' &&
    role !== 'admin'
  ) {
    if (loggedIn && !role) {
      return withSessionCookies(sessionResponse, redirectTo(request, ROLE_SELECT_PATH));
    }
    return withSessionCookies(
      sessionResponse,
      redirectTo(
        request,
        role ? '/' : '/login',
        role ? 'advertiser-forbidden' : 'payment-auth',
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
    '/api/payments/:path*',
    '/api/admin/:path*',
    '/api/ai-analyze',
    '/api/notifications/:path*',
    '/api/auth/naver',
    '/api/auth/naver/:path*',
    '/api/onboarding/:path*',
  ],
};
