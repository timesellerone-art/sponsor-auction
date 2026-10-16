import * as Sentry from '@sentry/nextjs';
import { getSentryDsn } from '@/lib/sentry-config';

export function captureException(
  error: unknown,
  extra?: Record<string, unknown>,
) {
  const normalized =
    error instanceof Error ? error : new Error(typeof error === 'string' ? error : 'Unknown error');

  if (!getSentryDsn()) {
    console.error('[Sentry Fallback]', normalized.message, extra ?? '');
    if (normalized.stack) {
      console.error(normalized.stack);
    }
    return;
  }

  Sentry.captureException(normalized, extra ? { extra } : undefined);
}
