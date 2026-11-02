import { createHmac, timingSafeEqual } from 'crypto';
import type { NaverProfile } from './naver-oauth';
import { getNaverOAuthEnv, readServerEnv } from './naver-oauth';

export const NAVER_GOTHUE_PROVIDER = 'custom:naver';
export const NAVER_IDENTITY_PROVIDERS = ['naver', NAVER_GOTHUE_PROVIDER] as const;

type SignedPayload = {
  p: string;
  s: string;
};

export type NaverIdpState = {
  s: string;
  r: string;
  o: string;
};

export type NaverIdpTicket = {
  sub: string;
  email: string;
  name: string;
  phone: string | null;
  exp: number;
};

function signingSecret() {
  const env = getNaverOAuthEnv();
  return (
    env?.clientSecret ||
    readServerEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
    ''
  );
}

function signPayload(value: string) {
  const secret = signingSecret();
  if (!secret) {
    throw new Error('네이버 서명 키가 없습니다.');
  }
  const signature = createHmac('sha256', secret).update(value).digest('base64url');
  const packed: SignedPayload = { p: value, s: signature };
  return Buffer.from(JSON.stringify(packed), 'utf8').toString('base64url');
}

function verifyPayload(token: string) {
  const secret = signingSecret();
  if (!secret || !token.trim()) {
    return null;
  }
  try {
    const packed = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as SignedPayload;
    if (!packed?.p || !packed?.s) {
      return null;
    }
    const expected = createHmac('sha256', secret).update(packed.p).digest('base64url');
    const left = Buffer.from(packed.s);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return null;
    }
    return packed.p;
  } catch {
    return null;
  }
}

export function isNaverIdentityProvider(provider: string | null | undefined) {
  return provider === 'naver' || provider === NAVER_GOTHUE_PROVIDER;
}

export function naverIdpPublicOrigin() {
  const fromEnv = (
    readServerEnv('NEXT_PUBLIC_SITE_URL') ||
    readServerEnv('NEXT_PUBLIC_APP_URL') ||
    'https://sponsor-auction-eta.vercel.app'
  ).trim();
  return fromEnv.replace(/\/$/, '') || 'https://sponsor-auction-eta.vercel.app';
}

export function signNaverIdpState(state: NaverIdpState) {
  return signPayload(JSON.stringify(state));
}

export function readNaverIdpState(token: string | null | undefined): NaverIdpState | null {
  const raw = verifyPayload(token ?? '');
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as NaverIdpState;
    if (!parsed?.s || !parsed?.r || !parsed?.o) {
      return null;
    }
    if (!parsed.r.includes('/auth/v1/callback')) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function signNaverIdpTicket(profile: NaverProfile) {
  const ticket: NaverIdpTicket = {
    sub: profile.id,
    email: profile.email,
    name: profile.name,
    phone: profile.phone,
    exp: Date.now() + 120_000,
  };
  return signPayload(JSON.stringify(ticket));
}

export function readNaverIdpTicket(token: string | null | undefined): NaverIdpTicket | null {
  const raw = verifyPayload(token ?? '');
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as NaverIdpTicket;
    if (!parsed?.sub || !parsed.exp || parsed.exp < Date.now()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function naverIdpUserInfo(ticket: NaverIdpTicket) {
  return {
    sub: ticket.sub,
    email: ticket.email,
    name: ticket.name,
    phone: ticket.phone ?? undefined,
    email_verified: ticket.email.includes('@') && !ticket.email.endsWith('@oauth.sponsor-auction.local'),
  };
}

export function appOriginFromIdpRequest(request: Request) {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get('app_origin')?.trim();
  if (fromQuery?.startsWith('http')) {
    return fromQuery.replace(/\/$/, '');
  }
  const referer = request.headers.get('referer') || request.headers.get('referrer') || '';
  try {
    const ref = new URL(referer);
    const redirectTo = ref.searchParams.get('redirect_to') || ref.searchParams.get('redirectTo') || '';
    if (redirectTo.startsWith('http')) {
      return new URL(redirectTo).origin;
    }
  } catch {
    // referer가 없으면 authorize 호스트를 쓴다.
  }
  return url.origin;
}
