export const IN_APP_BROWSER_MARKERS = ['KAKAOTALK', 'NAVER', 'Instagram', 'FBAN', 'FBAV'] as const;

export type InAppBrowserInfo = {
  inApp: boolean;
  marker: (typeof IN_APP_BROWSER_MARKERS)[number] | null;
  android: boolean;
  ios: boolean;
};

export function detectInAppBrowser(userAgent: string): InAppBrowserInfo {
  const ua = userAgent || '';
  const marker = IN_APP_BROWSER_MARKERS.find((item) => ua.includes(item)) ?? null;
  return {
    inApp: Boolean(marker),
    marker,
    android: /Android/i.test(ua),
    ios: /iPhone|iPad|iPod/i.test(ua),
  };
}

export function androidChromeIntentUrl(httpsUrl: string) {
  const url = new URL(httpsUrl);
  const fallback = encodeURIComponent(url.toString());
  return `intent://${url.host}${url.pathname}${url.search}${url.hash}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${fallback};end`;
}

export const ANDROID_EXTERNAL_BROWSER_KEY = 'clink-android-external-browser';
