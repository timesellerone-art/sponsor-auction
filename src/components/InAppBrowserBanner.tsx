'use client';

import { useEffect, useState } from 'react';
import {
  ANDROID_EXTERNAL_BROWSER_KEY,
  androidChromeIntentUrl,
  detectInAppBrowser,
} from '@/lib/in-app-browser';

export function InAppBrowserBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const info = detectInAppBrowser(window.navigator.userAgent);
    if (!info.inApp) {
      return;
    }
    if (info.android) {
      try {
        if (!window.sessionStorage.getItem(ANDROID_EXTERNAL_BROWSER_KEY)) {
          window.sessionStorage.setItem(ANDROID_EXTERNAL_BROWSER_KEY, '1');
          window.location.replace(androidChromeIntentUrl(window.location.href));
          return;
        }
      } catch {
        // sessionStorage가 막힌 인앱이면 배너만 보여 준다.
      }
    }
    setVisible(true);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <p className="font-semibold">인앱 브라우저에서는 로그인이 지연될 수 있습니다.</p>
      <p className="mt-1 text-xs leading-5 text-amber-800">
        오른쪽 위 메뉴에서 <span className="font-semibold">외부 브라우저</span> 또는 Safari로 연 뒤
        로그인해 주세요.
      </p>
    </div>
  );
}
