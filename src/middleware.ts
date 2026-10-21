import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_PRESENT_COOKIE_NAME, ROLE_COOKIE_NAME } from '@/lib/access';
import { ROLE_SELECT_PATH } from '@/lib/auth-guard';
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

export function middleware(request: NextRequest) {
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

  if (needsRole && (pathname.startsWith('/login') || !isOnboardingOpenPath(pathname))) {
    return redirectTo(request, ROLE_SELECT_PATH);
  }

  if (pathname.startsWith('/onboarding') && role) {
    return redirectTo(request, role === 'admin' ? '/admin' : '/my');
  }

  if (isAdminPath && role !== 'admin') {
    return redirectTo(
      request,
      role ? '/' : '/login',
      role ? 'admin-forbidden' : 'admin-auth',
    );
  }

  if (isDashboardPath && role !== 'advertiser' && role !== 'creator') {
    if (loggedIn && !role) {
      return redirectTo(request, ROLE_SELECT_PATH);
    }
    return redirectTo(
      request,
      role ? '/' : '/login',
      role ? 'advertiser-forbidden' : 'advertiser-auth',
    );
  }

  if (
    isPaymentPath &&
    role !== 'advertiser' &&
    role !== 'creator' &&
    role !== 'admin'
  ) {
    if (loggedIn && !role) {
      return redirectTo(request, ROLE_SELECT_PATH);
    }
    return redirectTo(
      request,
      role ? '/' : '/login',
      role ? 'advertiser-forbidden' : 'payment-auth',
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/login',
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
  ],
};
