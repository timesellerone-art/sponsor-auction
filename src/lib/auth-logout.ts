import { clientCookieSuffix } from '@/lib/site-origin';

export const NAVER_AUTH_COOKIE_NAMES = [
  'sa_naver_oauth_state',
  'sa_naver_oauth_next',
  'sa_account_link',
] as const;

const BROWSER_AUTH_COOKIE_NAMES = [
  ...NAVER_AUTH_COOKIE_NAMES,
  'sponsor-auction-oauth-next',
  'sponsor-auction-oauth-provider',
  'sponsor-auction-role',
  'sponsor-auction-active-role',
  'sponsor-auction-auth',
] as const;

let loggingOut = false;

export function beginAuthLogout() {
  loggingOut = true;
}

export function isAuthLoggingOut() {
  return loggingOut;
}

function expireNamedCookie(name: string) {
  const suffix = clientCookieSuffix();
  document.cookie = `${name}=; Max-Age=0${suffix}`;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax; Domain=.clinkapp.kr`;
}

export function expireBrowserAuthCookies() {
  if (typeof document === 'undefined') {
    return;
  }
  const names = new Set<string>(BROWSER_AUTH_COOKIE_NAMES);
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0];
    if (
      name.startsWith('sb-') ||
      name === 'sb-access-token' ||
      name === 'sb-refresh-token'
    ) {
      names.add(name);
    }
  }
  for (const name of names) {
    expireNamedCookie(name);
  }
}
