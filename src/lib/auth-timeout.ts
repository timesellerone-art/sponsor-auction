'use client';

import { useEffect, useState } from 'react';

/** 인증 부트스트랩이 끝나지 않아도 스피너를 해제하는 상한(ms). */
export const AUTH_BOOT_TIMEOUT_MS = 2500;

export function useSafetyTimeout(ms = AUTH_BOOT_TIMEOUT_MS) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTimedOut(true);
    }, ms);
    return () => {
      window.clearTimeout(timer);
    };
  }, [ms]);

  return timedOut;
}
