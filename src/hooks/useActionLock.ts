'use client';

import { useCallback, useRef, useState } from 'react';

export function useActionLock() {
  const lockRef = useRef(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const run = useCallback(async (key: string, action: () => Promise<void>) => {
    if (lockRef.current) {
      return false;
    }

    lockRef.current = true;
    setBusyKey(key);
    try {
      await action();
      return true;
    } catch (error) {
      console.warn('[SponsorAuction] 요청 처리 중 예외가 발생했습니다.', error);
      return false;
    } finally {
      lockRef.current = false;
      setBusyKey(null);
    }
  }, []);

  return {
    busyKey,
    isBusy: Boolean(busyKey),
    run,
  };
}
