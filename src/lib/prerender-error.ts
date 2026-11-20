const PRERENDER_DIGESTS = new Set([
  'HANGING_PROMISE_REJECTION',
  'NEXT_PRERENDER_INTERRUPTED',
]);

/** Next가 정적 생성을 멈추라고 던진 예외는 라우트 catch에서 삼키지 않는다. */
export function rethrowPrerenderError(error: unknown): void {
  if (!error || typeof error !== 'object' || !('digest' in error)) {
    return;
  }
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== 'string') {
    return;
  }
  if (PRERENDER_DIGESTS.has(digest) || digest.startsWith('NEXT_PRERENDER')) {
    throw error;
  }
}
