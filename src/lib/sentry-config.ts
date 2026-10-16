import * as Sentry from '@sentry/nextjs';

let loggedMissingDsn = false;

export function getSentryDsn() {
  return (process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || '').trim();
}

export function initSentry(runtime: 'client' | 'server' | 'edge') {
  const dsn = getSentryDsn();
  if (!dsn) {
    if (!loggedMissingDsn) {
      loggedMissingDsn = true;
      console.info('[Sentry Fallback] SENTRY_DSN이 없어 개발 로거로 우회합니다.', {
        runtime,
      });
    }
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    enabled: true,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  });
}
