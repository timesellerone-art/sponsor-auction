import { NextResponse } from 'next/server';

export const RATE_LIMIT_ERROR_CODE = 'RATE_LIMITED';
export const RATE_LIMIT_MESSAGE =
  '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';

const WINDOW_MS = 60_000;
const PRODUCTION_MAX = 60;
const DEV_MAX = 300;

const hits = new Map<string, number[]>();

function maxRequests() {
  const raw = Number(process.env.RATE_LIMIT_MAX);
  if (Number.isInteger(raw) && raw > 0) {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? PRODUCTION_MAX : DEV_MAX;
}

export function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) {
    return realIp;
  }
  return 'unknown';
}

export function shouldRateLimitPath(pathname: string) {
  if (!pathname.startsWith('/api/')) {
    return false;
  }
  if (pathname === '/api/notifications/deadline') {
    return false;
  }
  return (
    pathname.startsWith('/api/payments') ||
    pathname.startsWith('/api/admin') ||
    pathname.startsWith('/api/ai-analyze') ||
    pathname.startsWith('/api/notifications') ||
    pathname.startsWith('/api/auctions') ||
    pathname.startsWith('/api/bids') ||
    pathname.startsWith('/api/auth/naver') ||
    pathname.startsWith('/api/onboarding')
  );
}

export function consumeRateLimit(ip: string, pathname: string) {
  const now = Date.now();
  const key = `${ip}:${pathname}`;
  const windowStart = now - WINDOW_MS;
  const recent = (hits.get(key) ?? []).filter((stamp) => stamp > windowStart);
  if (recent.length >= maxRequests()) {
    hits.set(key, recent);
    const retryAfter = Math.max(
      1,
      Math.ceil(((recent[0] ?? now) + WINDOW_MS - now) / 1000),
    );
    return { allowed: false as const, retryAfter };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5_000) {
    for (const [entryKey, stamps] of hits) {
      const next = stamps.filter((stamp) => stamp > windowStart);
      if (next.length === 0) {
        hits.delete(entryKey);
      } else {
        hits.set(entryKey, next);
      }
    }
  }
  return { allowed: true as const, retryAfter: 0 };
}

export function rateLimitResponse(retryAfter: number) {
  return NextResponse.json(
    {
      error: RATE_LIMIT_MESSAGE,
      errorMessage: RATE_LIMIT_MESSAGE,
      errorCode: RATE_LIMIT_ERROR_CODE,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'Cache-Control': 'no-store',
      },
    },
  );
}
