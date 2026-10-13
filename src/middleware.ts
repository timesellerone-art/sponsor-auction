import { NextResponse, type NextRequest } from 'next/server';
import { ROLE_COOKIE_NAME } from '@/lib/access';

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
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isAdvertiserPath = pathname === '/my' || pathname.startsWith('/my/');

  if (isAdminPath && role !== 'admin') {
    return redirectWithReason(
      request,
      role ? '/' : '/login',
      role ? 'admin-forbidden' : 'admin-auth',
    );
  }

  if (isAdvertiserPath && role !== 'advertiser') {
    return redirectWithReason(
      request,
      role ? '/' : '/login',
      role ? 'advertiser-forbidden' : 'advertiser-auth',
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin', '/admin/:path*', '/my', '/my/:path*'],
};
