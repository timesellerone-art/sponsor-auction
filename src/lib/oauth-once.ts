const DEFAULT_TTL_MS = 45_000;

const inflight = new Map<string, Promise<unknown>>();

/** 같은 OAuth code/token 처리는 한 번만 수행하고, 늦은 중복 요청은 그 결과를 재사용한다. */
export function shareOAuthAttempt<T>(key: string, run: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const existing = inflight.get(key);
  if (existing) {
    return existing as Promise<T>;
  }
  const pending = run();
  inflight.set(key, pending);
  pending.then(
    () => {
      const timer = setTimeout(() => {
        if (inflight.get(key) === pending) {
          inflight.delete(key);
        }
      }, ttlMs);
      if (typeof timer === 'object' && timer && 'unref' in timer) {
        timer.unref();
      }
    },
    () => {
      if (inflight.get(key) === pending) {
        inflight.delete(key);
      }
    },
  );
  return pending;
}

export function resetOAuthAttempts() {
  inflight.clear();
}
