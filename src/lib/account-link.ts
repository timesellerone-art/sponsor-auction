import { createHmac, timingSafeEqual } from 'crypto';
import { isSupabaseAuthCookieName } from '@/lib/auth-paths';
import { readServerEnv } from '@/lib/naver-oauth';

export const ACCOUNT_LINK_COOKIE = 'sa_account_link';
export const ACCOUNT_LINK_MAX_AGE_SEC = 15 * 60;

const USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isAuthUserId(value: string | null | undefined) {
  return Boolean(value && USER_ID_RE.test(value));
}

export function readAuthUserIdFromCookies(
  cookies: Array<{ name: string; value?: string }>,
): string | null {
  const chunks = cookies
    .filter((cookie) => isSupabaseAuthCookieName(cookie.name) && cookie.value)
    .sort((left, right) => left.name.localeCompare(right.name, 'en', { numeric: true }));
  const raw = chunks.map((cookie) => cookie.value ?? '').join('');
  if (!raw) {
    return null;
  }
  try {
    const json = raw.startsWith('base64-')
      ? Buffer.from(raw.slice('base64-'.length), 'base64url').toString('utf8')
      : decodeURIComponent(raw);
    const session = JSON.parse(json) as { user?: { id?: string } };
    return isAuthUserId(session.user?.id) ? session.user?.id ?? null : null;
  } catch {
    return null;
  }
}

function signingSecret() {
  return (
    readServerEnv('SUPABASE_SERVICE_ROLE_KEY')?.trim() ||
    readServerEnv('SUPABASE_SERVICE_KEY')?.trim() ||
    readServerEnv('SUPABASE_SECRET_KEY')?.trim() ||
    readServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')?.trim() ||
    ''
  );
}

export function signAccountLinkValue(userId: string, nowMs = Date.now()) {
  const secret = signingSecret();
  if (!secret || !isAuthUserId(userId)) {
    return '';
  }
  const exp = Math.floor(nowMs / 1000) + ACCOUNT_LINK_MAX_AGE_SEC;
  const payload = `${userId}.${exp}`;
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readAccountLinkUserId(value: string | null | undefined, nowMs = Date.now()) {
  const secret = signingSecret();
  const parts = value?.trim().split('.') ?? [];
  if (!secret || parts.length !== 3) {
    return null;
  }
  const [userId, expRaw, signature] = parts;
  const exp = Number(expRaw);
  if (!isAuthUserId(userId) || !Number.isFinite(exp) || exp * 1000 < nowMs || !signature) {
    return null;
  }
  const expected = createHmac('sha256', secret).update(`${userId}.${expRaw}`).digest('base64url');
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }
  return userId;
}

export function accountLinkCookieOptions(secure: boolean) {
  return {
    path: '/' as const,
    maxAge: ACCOUNT_LINK_MAX_AGE_SEC,
    sameSite: 'lax' as const,
    httpOnly: true,
    ...(secure ? { secure: true } : {}),
  };
}

export function writeAccountLinkCookie(
  store: {
    set: (
      name: string,
      value: string,
      options: {
        path: string;
        maxAge: number;
        sameSite: 'lax';
        httpOnly: boolean;
        secure?: boolean;
      },
    ) => void;
  },
  userId: string,
  secure: boolean,
) {
  const value = signAccountLinkValue(userId);
  if (!value) {
    return;
  }
  store.set(ACCOUNT_LINK_COOKIE, value, accountLinkCookieOptions(secure));
}

export function pickPreferredMergeUser<T extends { id: string; created_at: string }>(
  incomingId: string,
  candidates: T[],
  preferredId?: string | null,
): T | null {
  const preferred = candidates.find(
    (item) => item.id === preferredId && item.id !== incomingId,
  );
  if (preferred) {
    return preferred;
  }
  const others = candidates
    .filter((item) => item.id !== incomingId)
    .sort((left, right) => {
      const diff = Date.parse(left.created_at) - Date.parse(right.created_at);
      return Number.isFinite(diff) && diff !== 0 ? diff : left.id.localeCompare(right.id);
    });
  return others[0] ?? null;
}
