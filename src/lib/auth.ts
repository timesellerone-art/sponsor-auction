import {
  mockGetSession,
  mockSaveMemberRole,
  mockSignIn,
  mockSignOut,
  mockSignUp,
} from '@/lib/auth-mock';
import { syncAuthPresentCookie, syncRoleCookie } from '@/lib/access';
import { createClient } from '@/lib/supabase/client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { ROLE_SELECT_PATH, sanitizeNextPath } from '@/lib/auth-guard';
import {
  isAuthProfileRole,
  isMemberRole,
  type MemberRole,
  type SessionUser,
} from '@/types/auth';
import type { DataResult } from '@/types/auction';

export const AUTH_FAIL_MESSAGE = '요청을 처리하지 못했습니다. 다시 시도해 주세요.';

function errorText(error: unknown) {
  if (!error) {
    return '';
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function isAuthSessionMissing(error: unknown): boolean {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';
  return /auth session missing/i.test(errorText(error)) || name === 'AuthSessionMissingError';
}

function isInvalidLoginCredentials(error: unknown) {
  return /invalid login credentials|invalid_credentials|invalid email or password/i.test(
    errorText(error),
  );
}

function publicAuthErrorMessage(error: unknown) {
  const text = errorText(error);
  if (isInvalidLoginCredentials(error)) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (/email not confirmed/i.test(text)) {
    return '이메일 인증 후 로그인해 주세요.';
  }
  if (/too many requests|rate limit/i.test(text)) {
    return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  }
  return AUTH_FAIL_MESSAGE;
}

function persistClientAuth(user: SessionUser | null) {
  syncRoleCookie(user?.role ?? null);
  syncAuthPresentCookie(Boolean(user));
}

const AUTH_CHANGED_EVENT = 'auth:changed';
const AUTH_SESSION_EVENT = 'auth:session';

const PROFILE_COLUMNS = 'id, name, email, role, status';

type ProfileRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
};

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} 응답이 지연되었습니다.`));
    }, ms);

    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

function mapSessionUser(
  id: string,
  email: string,
  name: string,
  role: string | null | undefined,
  authUser?: {
    created_at?: string;
    last_sign_in_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null,
): SessionUser {
  return {
    id,
    email,
    name,
    role: isAuthProfileRole(role) ? role : null,
    createdAt: authUser?.created_at,
    lastSignInAt: authUser?.last_sign_in_at,
    onboardingComplete: authUser?.user_metadata?.onboarding_complete === true,
  };
}

export function notifyAuthChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

export function applyKnownSession(user: SessionUser | null) {
  persistClientAuth(user);
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new CustomEvent<SessionUser | null>(AUTH_SESSION_EVENT, { detail: user }));
}

export function onKnownSession(listener: (user: SessionUser | null) => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handler = (event: Event) => {
    listener((event as CustomEvent<SessionUser | null>).detail ?? null);
  };
  window.addEventListener(AUTH_SESSION_EVENT, handler);
  return () => {
    window.removeEventListener(AUTH_SESSION_EVENT, handler);
  };
}

export function onAuthChanged(listener: () => void) {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  window.addEventListener(AUTH_CHANGED_EVENT, listener);
  return () => {
    window.removeEventListener(AUTH_CHANGED_EVENT, listener);
  };
}

export function subscribeAuthState(listener: () => void) {
  const unsubWindow = onAuthChanged(listener);
  const supabase = createClient();
  if (!supabase) {
    return unsubWindow;
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange(() => {
    try {
      listener();
    } catch (error) {
      console.warn('[SponsorAuction] 인증 상태 리스너 처리에 실패했습니다.', error);
    }
  });

  return () => {
    unsubWindow();
    subscription.unsubscribe();
  };
}

export type SocialOAuthProvider = 'google' | 'kakao' | 'naver' | 'apple';

function oauthRedirectTo(nextPath?: string | null) {
  const origin = window.location.origin;
  const next = sanitizeNextPath(nextPath) ?? ROLE_SELECT_PATH;
  return `${origin}/auth/callback?next=${encodeURIComponent(next)}`;
}

export async function signInWithOAuth(
  provider: SocialOAuthProvider,
  nextPath?: string | null,
): Promise<DataResult<boolean>> {
  if (provider === 'naver') {
    return signInWithNaver(nextPath);
  }

  const supabase = createClient();
  if (!supabase) {
    return fail(false, 'Supabase가 설정되지 않아 소셜 로그인을 사용할 수 없습니다.');
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider as 'apple',
      options: {
        redirectTo: oauthRedirectTo(nextPath),
        skipBrowserRedirect: true,
        queryParams:
          provider === 'google'
            ? { access_type: 'offline', prompt: 'consent' }
            : undefined,
      },
    });

    if (error) {
      console.warn('[SponsorAuction] 소셜 로그인에 실패했습니다.', error.message);
      return fail(false, error.message || AUTH_FAIL_MESSAGE);
    }

    if (!data.url) {
      return fail(false, AUTH_FAIL_MESSAGE);
    }

    window.location.assign(data.url);
    return ok(true);
  } catch (error) {
    console.warn('[SponsorAuction] 소셜 로그인 중 예외가 발생했습니다.', error);
    return fail(false, AUTH_FAIL_MESSAGE);
  }
}

export async function signInWithGoogle(nextPath?: string | null) {
  return signInWithOAuth('google', nextPath);
}

export async function signInWithKakao(nextPath?: string | null) {
  return signInWithOAuth('kakao', nextPath);
}

export async function signInWithNaver(nextPath?: string | null) {
  if (typeof window === 'undefined') {
    return fail(false, AUTH_FAIL_MESSAGE);
  }
  const next = sanitizeNextPath(nextPath) ?? '/';
  window.location.assign(`/api/auth/naver?next=${encodeURIComponent(next)}`);
  return ok(true);
}

export async function signInWithApple(nextPath?: string | null) {
  return signInWithOAuth('apple', nextPath);
}

async function loadProfile(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  userId: string,
  fallbackEmail: string,
  fallbackName: string,
  authUser?: {
    created_at?: string;
    last_sign_in_at?: string | null;
    user_metadata?: Record<string, unknown>;
  } | null,
): Promise<SessionUser> {
  const { data, error } = await withTimeout(
    supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
    2500,
    '프로필 조회',
  );

  if (error) {
    console.warn('[SponsorAuction] 프로필 조회에 실패했습니다.', error.message);
  }

  const row = (data ?? null) as ProfileRow | null;
  return mapSessionUser(
    userId,
    row?.email?.trim() || fallbackEmail,
    row?.name?.trim() || fallbackName || fallbackEmail.split('@')[0] || '회원',
    row?.role,
    authUser,
  );
}

async function readBrowserAuthUser(
  supabase: NonNullable<ReturnType<typeof createClient>>,
) {
  try {
    const { data, error } = await withTimeout(
      supabase.auth.getSession(),
      2500,
      '세션 조회',
    );
    if (error) {
      if (isAuthSessionMissing(error)) {
        console.warn('[SponsorAuction] 인증 세션이 없습니다.', error.message);
        return null;
      }
      console.warn('[SponsorAuction] 세션 조회에 실패했습니다.', error.message);
    }
    return data.session?.user ?? null;
  } catch (error) {
    if (isAuthSessionMissing(error)) {
      console.warn(
        '[SponsorAuction] 인증 세션이 없습니다.',
        error instanceof Error ? error.message : error,
      );
      return null;
    }
    console.warn('[SponsorAuction] 세션 조회 중 예외가 발생했습니다.', error);
    return null;
  }
}

export async function getSessionUser(): Promise<DataResult<SessionUser | null>> {
  const supabase = createClient();
  if (!supabase) {
    try {
      return await mockGetSession();
    } catch (error) {
      console.warn('[SponsorAuction] Mock 세션 조회에 실패했습니다.', error);
      return ok(null);
    }
  }

  try {
    const user = await readBrowserAuthUser(supabase);
    if (!user) {
      try {
        return await mockGetSession();
      } catch (error) {
        console.warn('[SponsorAuction] Mock 세션 조회에 실패했습니다.', error);
        return ok(null);
      }
    }

    const email = user.email?.trim() || '';
    const name =
      (typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : '') || email.split('@')[0] || '회원';
    const session = await loadProfile(supabase, user.id, email, name, user);
    return ok(session);
  } catch (error) {
    if (isAuthSessionMissing(error)) {
      console.warn(
        '[SponsorAuction] 인증 세션이 없습니다.',
        error instanceof Error ? error.message : error,
      );
      return ok(null);
    }
    console.warn('[SponsorAuction] 세션 조회 중 예외가 발생했습니다.', error);
    try {
      return await mockGetSession();
    } catch {
      return ok(null);
    }
  }
}

export async function signUp(input: {
  name: string;
  email: string;
  password: string;
}): Promise<DataResult<SessionUser | null>> {
  const supabase = createClient();
  if (!supabase) {
    const result = await mockSignUp(input);
    if (!result.error) {
      applyKnownSession(result.data);
      notifyAuthChanged();
    }
    return result;
  }

  try {
    const name = input.name.trim();
    const email = input.email.trim().toLowerCase();
    const password = input.password;

    if (!name) {
      return fail(null, '이름을 입력해 주세요.');
    }
    if (!email.includes('@')) {
      return fail(null, '올바른 이메일을 입력해 주세요.');
    }
    if (password.trim().length < 6) {
      return fail(null, '비밀번호는 6자 이상이어야 합니다.');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name },
      },
    });

    if (error) {
      console.warn('[SponsorAuction] 회원가입에 실패했습니다.', error.message);
      const mock = await mockSignUp(input);
      if (!mock.error) {
        applyKnownSession(mock.data);
        notifyAuthChanged();
        return mock;
      }
      return fail(null, publicAuthErrorMessage(error));
    }

    const user = data.user;
    if (!user) {
      return fail(null, '이메일 인증 후 로그인해 주세요.');
    }

    const accessToken = data.session?.access_token ?? '';
    if (accessToken) {
      await fetch('/api/onboarding/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name, email }),
      }).catch(() => null);
    } else {
      await supabase
        .from('profiles')
        .upsert(
          {
            id: user.id,
            name,
            email: user.email?.trim() || email,
            status: 'active',
          },
          { onConflict: 'id' },
        )
        .then(({ error: profileError }) => {
          if (profileError) {
            console.warn('[SponsorAuction] 가입 프로필 저장 실패', profileError.message);
          }
        });
    }

    const session = await loadProfile(
      supabase,
      user.id,
      user.email?.trim() || email,
      name,
      user,
    );
    applyKnownSession(session);
    notifyAuthChanged();
    return ok(session);
  } catch (error) {
    console.warn('[SponsorAuction] 회원가입 중 예외가 발생했습니다.', error);
    const mock = await mockSignUp(input);
    if (!mock.error) {
      applyKnownSession(mock.data);
      notifyAuthChanged();
      return mock;
    }
    return fail(null, AUTH_FAIL_MESSAGE);
  }
}

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<DataResult<SessionUser | null>> {
  const supabase = createClient();
  if (!supabase) {
    const result = await mockSignIn(input);
    if (!result.error) {
      applyKnownSession(result.data);
      notifyAuthChanged();
    }
    return result;
  }

  try {
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({
        email: input.email.trim().toLowerCase(),
        password: input.password,
      }),
      4000,
      '로그인',
    );

    if (error || !data.user) {
      const mock = await mockSignIn(input);
      if (!mock.error) {
        applyKnownSession(mock.data);
        notifyAuthChanged();
        return mock;
      }
      return fail(null, publicAuthErrorMessage(error));
    }

    const user = data.user;
    const email = user.email?.trim() || input.email.trim().toLowerCase();
    const name =
      (typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : '') || email.split('@')[0] || '회원';
    const session = await loadProfile(supabase, user.id, email, name, user);
    applyKnownSession(session);
    notifyAuthChanged();
    return ok(session);
  } catch (error) {
    const mock = await mockSignIn(input);
    if (!mock.error) {
      applyKnownSession(mock.data);
      notifyAuthChanged();
      return mock;
    }
    return fail(null, publicAuthErrorMessage(error));
  }
}

export async function signOut(): Promise<DataResult<boolean>> {
  const supabase = createClient();
  if (!supabase) {
    applyKnownSession(null);
    const result = await mockSignOut();
    if (!result.error) {
      notifyAuthChanged();
    }
    return result;
  }

  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn('[SponsorAuction] 로그아웃에 실패했습니다.', error.message);
    }

    applyKnownSession(null);
    const mock = await mockSignOut();
    if (!mock.error) {
      notifyAuthChanged();
      return ok(true);
    }

    if (error) {
      return fail(false, AUTH_FAIL_MESSAGE);
    }

    notifyAuthChanged();
    return ok(true);
  } catch (error) {
    console.warn('[SponsorAuction] 로그아웃 중 예외가 발생했습니다.', error);
    return fail(false, AUTH_FAIL_MESSAGE);
  }
}

async function upsertProfileRow(
  supabase: NonNullable<ReturnType<typeof createClient>>,
  payload: {
    id: string;
    name: string;
    email: string;
    role: MemberRole;
    status: 'active';
  },
) {
  const upserted = await withTimeout(
    supabase.from('profiles').upsert(payload, { onConflict: 'id' }).select(PROFILE_COLUMNS).maybeSingle(),
    4000,
    '프로필 저장',
  );
  if (!upserted.error) {
    return upserted;
  }

  const updated = await withTimeout(
    supabase
      .from('profiles')
      .update({
        name: payload.name,
        email: payload.email,
        role: payload.role,
        status: payload.status,
      })
      .eq('id', payload.id)
      .select(PROFILE_COLUMNS)
      .maybeSingle(),
    4000,
    '프로필 수정',
  );
  if (!updated.error && updated.data) {
    return updated;
  }

  return upserted;
}

async function saveRoleViaApi(
  accessToken: string,
  role: MemberRole,
  name: string,
  email: string,
): Promise<SessionUser | null> {
  const response = await fetch('/api/onboarding/role', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ role, name, email }),
  });
  const payload = (await response.json().catch(() => null)) as {
    data?: { id?: string; email?: string; name?: string; role?: string | null };
    error?: string;
  } | null;
  if (!response.ok || !payload?.data?.id) {
    return null;
  }
  return mapSessionUser(
    payload.data.id,
    payload.data.email?.trim() || email,
    payload.data.name?.trim() || name,
    payload.data.role,
  );
}

export async function saveMemberRole(
  role: MemberRole,
): Promise<DataResult<SessionUser | null>> {
  if (!isMemberRole(role)) {
    return fail(null, '광고주 또는 크리에이터 역할을 선택해 주세요.');
  }

  const supabase = createClient();
  if (!supabase) {
    const result = await mockSaveMemberRole(role);
    if (!result.error) {
      applyKnownSession(result.data);
    }
    return result;
  }

  try {
    const sessionResult = await withTimeout(supabase.auth.getSession(), 2500, '세션 조회');
    const authUser = sessionResult.data.session?.user ?? (await readBrowserAuthUser(supabase));
    const accessToken = sessionResult.data.session?.access_token ?? '';
    if (!authUser) {
      const mock = await mockSaveMemberRole(role);
      if (!mock.error) {
        applyKnownSession(mock.data);
        return mock;
      }
      return fail(null, '로그인이 필요합니다.');
    }

    const email = authUser.email?.trim() || '';
    const name =
      (typeof authUser.user_metadata?.name === 'string'
        ? authUser.user_metadata.name
        : '') || email.split('@')[0] || '회원';

    void supabase.auth.updateUser({
      data: { onboarding_complete: true, role },
    }).catch(() => null);

    if (accessToken) {
      const fromApi = await saveRoleViaApi(accessToken, role, name, email);
      if (fromApi) {
        const completed = { ...fromApi, onboardingComplete: true as const };
        applyKnownSession(completed);
        return ok(completed);
      }
    }

    const payload = {
      id: authUser.id,
      name,
      email,
      role,
      status: 'active' as const,
    };

    const { data, error } = await upsertProfileRow(supabase, payload);
    if (error || !data) {
      console.warn('[SponsorAuction] 역할 저장에 실패했습니다.', error?.message);
      return fail(null, AUTH_FAIL_MESSAGE);
    }

    const row = data as ProfileRow;
    const session = mapSessionUser(
      authUser.id,
      row.email?.trim() || email,
      row.name?.trim() || name,
      row.role,
      {
        ...authUser,
        user_metadata: {
          ...(authUser.user_metadata ?? {}),
          onboarding_complete: true,
        },
      },
    );
    applyKnownSession(session);
    return ok(session);
  } catch (error) {
    console.warn('[SponsorAuction] 역할 저장 중 예외가 발생했습니다.', error);
    return fail(null, AUTH_FAIL_MESSAGE);
  }
}
