import { POST_AUTH_HOME, sanitizeNextPath } from '@/lib/auth-guard';
import { isPlaceholderOAuthEmail, normalizePhone } from '@/lib/contact';
import { authCookieDomain, requestAppOrigin } from '@/lib/site-origin';

export const NAVER_STATE_COOKIE = 'sa_naver_st';
export const NAVER_NEXT_COOKIE = 'sa_naver_nx';
export const LEGACY_NAVER_STATE_COOKIE = 'sa_naver_oauth_state';
export const LEGACY_NAVER_NEXT_COOKIE = 'sa_naver_oauth_next';
export const NAVER_OAUTH_COOKIE_NAMES = [
  NAVER_STATE_COOKIE,
  NAVER_NEXT_COOKIE,
  LEGACY_NAVER_STATE_COOKIE,
  LEGACY_NAVER_NEXT_COOKIE,
] as const;
export const NAVER_AUTHORIZE_URL = 'https://nid.naver.com/oauth2.0/authorize';
export const NAVER_TOKEN_URL = 'https://nid.naver.com/oauth2.0/token';
export const NAVER_PROFILE_URL = 'https://openapi.naver.com/v1/nid/me';

type NaverEnv = {
  clientId: string;
  clientSecret: string;
};

type NaverTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type NaverProfileResponse = {
  resultcode?: string;
  message?: string;
  response?: {
    id?: string;
    email?: string;
    name?: string;
    nickname?: string;
    profile_image?: string;
    mobile?: string;
    mobile_e164?: string;
  };
};

export type NaverProfile = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  avatarUrl: string | null;
};

const NAVER_CLIENT_ID_KEYS = [
  'NAVER_CLIENT_ID',
  'NEXT_PUBLIC_NAVER_CLIENT_ID',
  'SUPABASE_AUTH_EXTERNAL_NAVER_CLIENT_ID',
  'AUTH_NAVER_CLIENT_ID',
  'NAVER_ID',
] as const;

const NAVER_CLIENT_SECRET_KEYS = [
  'NAVER_CLIENT_SECRET',
  'NAVER_SECRET',
  'SUPABASE_AUTH_EXTERNAL_NAVER_SECRET',
  'AUTH_NAVER_SECRET',
  'NAVER_CLIENT_SECRET_KEY',
] as const;

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  if (!trimmed || /YOUR_|placeholder/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

/** Next 빌드 시 `process.env.NAME` 정적 치환을 피하고 Vercel 런타임 값을 읽는다. */
export function readServerEnv(name: string) {
  return process.env[name];
}

function firstCleanEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = cleanEnv(readServerEnv(key));
    if (value) {
      return value;
    }
  }
  return '';
}

export function missingNaverOAuthEnvKeys() {
  const missing: string[] = [];
  if (!firstCleanEnv(NAVER_CLIENT_ID_KEYS)) {
    missing.push('NAVER_CLIENT_ID');
  }
  if (!firstCleanEnv(NAVER_CLIENT_SECRET_KEYS)) {
    missing.push('NAVER_CLIENT_SECRET');
  }
  return missing;
}

export function getNaverOAuthEnv(): NaverEnv | null {
  const clientId = firstCleanEnv(NAVER_CLIENT_ID_KEYS);
  const clientSecret = firstCleanEnv(NAVER_CLIENT_SECRET_KEYS);
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

export function requestOrigin(request: Request) {
  return requestAppOrigin(request);
}

export function naverCallbackUrl(origin: string) {
  return `${origin}/api/auth/naver/callback`;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function createNaverState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

export function publicNaverClientId() {
  return cleanEnv(readServerEnv('NEXT_PUBLIC_NAVER_CLIENT_ID'));
}

export function cookieOptions(secure = false, hostname?: string | null) {
  const domain = authCookieDomain(hostname);
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    path: '/',
    maxAge: 10 * 60,
    ...(domain ? { domain } : {}),
  };
}

/** 쿠키가 유실돼도 URL의 code·state로 토큰 교환과 계정 병합을 이어간다. */
export function shouldAcceptNaverOAuthCallback(params: {
  code: string;
  state: string;
  expectedState: string;
  signedIdp: boolean;
}) {
  if (!params.code || !params.state) {
    return false;
  }
  if (params.signedIdp) {
    return true;
  }
  if (!params.expectedState) {
    return true;
  }
  return params.state === params.expectedState;
}

export function buildNaverAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const url = new URL(NAVER_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', params.clientId);
  url.searchParams.set('redirect_uri', params.redirectUri);
  url.searchParams.set('state', params.state);
  return url.toString();
}

export function readStoredNext(value: string | undefined) {
  return sanitizeNextPath(value ?? null) ?? POST_AUTH_HOME;
}

export async function exchangeNaverCode(params: {
  clientId: string;
  clientSecret: string;
  code: string;
  state: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: params.clientId,
    client_secret: params.clientSecret,
    code: params.code,
    state: params.state,
    redirect_uri: params.redirectUri,
  });

  const response = await fetch(NAVER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    },
    body,
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as NaverTokenResponse | null;
  const accessToken = payload?.access_token?.trim() ?? '';
  if (!response.ok || !accessToken) {
    const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`;
    throw new Error(`네이버 토큰 발급에 실패했습니다. (${detail})`);
  }
  return accessToken;
}

export function parseNaverProfilePayload(
  payload: NaverProfileResponse | null,
): NaverProfile {
  const profile = payload?.response;
  const id = profile?.id?.trim() ?? '';
  if (payload?.resultcode !== '00' || !id) {
    throw new Error(payload?.message || '네이버 프로필을 가져오지 못했습니다.');
  }

  const emailFromNaver = profile?.email?.trim().toLowerCase() ?? '';
  const email =
    emailFromNaver.includes('@') && !isPlaceholderOAuthEmail(emailFromNaver)
      ? emailFromNaver
      : `naver.${id}@oauth.sponsor-auction.local`;
  const phone =
    normalizePhone(profile?.mobile_e164) || normalizePhone(profile?.mobile) || null;
  const name =
    profile?.name?.trim() ||
    profile?.nickname?.trim() ||
    email.split('@')[0] ||
    '네이버 회원';

  return {
    id,
    email,
    name,
    phone,
    avatarUrl: profile?.profile_image?.trim() || null,
  };
}

export async function fetchNaverProfile(accessToken: string): Promise<NaverProfile> {
  const response = await fetch(NAVER_PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as NaverProfileResponse | null;
  if (!response.ok) {
    throw new Error(payload?.message || '네이버 프로필을 가져오지 못했습니다.');
  }
  return parseNaverProfilePayload(payload);
}
