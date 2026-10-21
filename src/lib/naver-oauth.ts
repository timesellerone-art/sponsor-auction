import { randomBytes } from 'crypto';
import { ROLE_SELECT_PATH, sanitizeNextPath } from '@/lib/auth-guard';

export const NAVER_STATE_COOKIE = 'sa_naver_oauth_state';
export const NAVER_NEXT_COOKIE = 'sa_naver_oauth_next';
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
  };
};

export type NaverProfile = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

function cleanEnv(value: string | undefined) {
  const trimmed = value?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  if (!trimmed || /YOUR_|placeholder/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

export function getNaverOAuthEnv(): NaverEnv | null {
  const clientId = cleanEnv(process.env.NAVER_CLIENT_ID);
  const clientSecret = cleanEnv(process.env.NAVER_CLIENT_SECRET);
  if (!clientId || !clientSecret) {
    return null;
  }
  return { clientId, clientSecret };
}

export function requestOrigin(request: Request) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) {
    return `${forwardedProto === 'http' ? 'http' : 'https'}://${forwardedHost}`;
  }
  return url.origin;
}

export function naverCallbackUrl(origin: string) {
  return `${origin}/api/auth/naver/callback`;
}

export function createNaverState() {
  return randomBytes(24).toString('base64url');
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60,
  };
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
  url.searchParams.set('auth_type', 'reauthenticate');
  return url.toString();
}

export function readStoredNext(value: string | undefined) {
  return sanitizeNextPath(value ?? null) ?? ROLE_SELECT_PATH;
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

export async function fetchNaverProfile(accessToken: string): Promise<NaverProfile> {
  const response = await fetch(NAVER_PROFILE_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });
  const payload = (await response.json().catch(() => null)) as NaverProfileResponse | null;
  const profile = payload?.response;
  const id = profile?.id?.trim() ?? '';
  if (!response.ok || payload?.resultcode !== '00' || !id) {
    throw new Error(payload?.message || '네이버 프로필을 가져오지 못했습니다.');
  }

  const emailFromNaver = profile?.email?.trim().toLowerCase() ?? '';
  const email = emailFromNaver.includes('@')
    ? emailFromNaver
    : `naver.${id}@oauth.sponsor-auction.local`;
  const name =
    profile?.name?.trim() ||
    profile?.nickname?.trim() ||
    email.split('@')[0] ||
    '네이버 회원';

  return {
    id,
    email,
    name,
    avatarUrl: profile?.profile_image?.trim() || null,
  };
}
