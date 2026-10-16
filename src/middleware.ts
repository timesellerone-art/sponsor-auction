import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_COOKIE_NAME } from '@/lib/access';
import {
  clientIp,
  consumeRateLimit,
  rateLimitResponse,
  shouldRateLimitPath,
} from '@/lib/rate-limit';

function redirectWithReason(
  request: NextRequest,
  pathname: '/' | '/login',
  reason: string,
) {
  const url = request.nextUrl.clone();
  const nextPath = request.nextUrl.pathname;
  url.pathname = pathname;
  url.search = '';
  url.searchParams.set('reason', reason);
  if (pathname === '/login' && nextPath.startsWith('/')) {
    url.searchParams.set('next', nextPath);
  }
  return NextResponse.redirect(url);
}

export function middleware(request: NextRequest) {
  const role = request.cookies.get(ROLE_COOKIE_NAME)?.value ?? '';
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

  if (isAdminPath && role !== 'admin') {
    return redirectWithReason(
      request,
      role ? '/' : '/login',
      role ? 'admin-forbidden' : 'admin-auth',
    );
  }

  if (isDashboardPath && role !== 'advertiser' && role !== 'creator') {
    return redirectWithReason(
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
    return redirectWithReason(
      request,
      role ? '/' : '/login',
      role ? 'advertiser-forbidden' : 'payment-auth',
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
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
  ],
};
