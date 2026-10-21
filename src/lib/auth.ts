import {
  mockGetSession,
  mockSaveMemberRole,
  mockSignIn,
  mockSignOut,
  mockSignUp,
} from '@/lib/auth-mock';
import { createClient } from '@/lib/supabase/client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { sanitizeNextPath } from '@/lib/auth-guard';
import {
  isAuthProfileRole,
  isMemberRole,
  type MemberRole,
  type SessionUser,
} from '@/types/auth';
import type { DataResult } from '@/types/auction';

export const AUTH_FAIL_MESSAGE = '요청을 처리하지 못했습니다. 다시 시도해 주세요.';

function isAuthSessionMissing(error: unknown): boolean {
  if (!error) {
    return false;
  }
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : String(error);
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : '';
  return /auth session missing/i.test(message) || name === 'AuthSessionMissingError';
}

const AUTH_CHANGED_EVENT = 'auth:changed';

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
): SessionUser {
  return {
    id,
    email,
    name,
    role: isAuthProfileRole(role) ? role : null,
  };
}

export function notifyAuthChanged() {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
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
  const next = sanitizeNextPath(nextPath) ?? '/';
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
    const { error } = await supabase.auth.signInWithOAuth({
      provider: provider as 'apple',
      options: {
        redirectTo: oauthRedirectTo(nextPath),
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
): Promise<SessionUser> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[SponsorAuction] 프로필 조회에 실패했습니다.', error.message);
  }

  const row = (data ?? null) as ProfileRow | null;
  return mapSessionUser(
    userId,
    row?.email?.trim() || fallbackEmail,
    row?.name?.trim() || fallbackName || fallbackEmail.split('@')[0] || '회원',
    row?.role,
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
    const session = await loadProfile(supabase, user.id, email, name);
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
        notifyAuthChanged();
        return mock;
      }
      return fail(null, error.message || AUTH_FAIL_MESSAGE);
    }

    const user = data.user;
    if (!user) {
      return fail(null, '이메일 인증 후 로그인해 주세요.');
    }

    const session = await loadProfile(
      supabase,
      user.id,
      user.email?.trim() || email,
      name,
    );
    notifyAuthChanged();
    return ok(session);
  } catch (error) {
    console.warn('[SponsorAuction] 회원가입 중 예외가 발생했습니다.', error);
    const mock = await mockSignUp(input);
    if (!mock.error) {
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
      console.warn('[SponsorAuction] Supabase 로그인에 실패했습니다.', error?.message);
      const mock = await mockSignIn(input);
      if (!mock.error) {
        notifyAuthChanged();
        return mock;
      }
      return fail(null, '이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    const user = data.user;
    const email = user.email?.trim() || input.email.trim().toLowerCase();
    const name =
      (typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : '') || email.split('@')[0] || '회원';
    const session = await loadProfile(supabase, user.id, email, name);
    notifyAuthChanged();
    return ok(session);
  } catch (error) {
    console.warn('[SponsorAuction] 로그인 중 예외가 발생했습니다.', error);
    const mock = await mockSignIn(input);
    if (!mock.error) {
      notifyAuthChanged();
      return mock;
    }
    return fail(null, AUTH_FAIL_MESSAGE);
  }
}

export async function signOut(): Promise<DataResult<boolean>> {
  const supabase = createClient();
  if (!supabase) {
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
      notifyAuthChanged();
    }
    return result;
  }

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      if (isAuthSessionMissing(authError)) {
        console.warn('[SponsorAuction] 인증 세션이 없습니다.', authError.message);
      } else {
        console.warn('[SponsorAuction] 사용자 조회에 실패했습니다.', authError.message);
      }
    }
    if (authError || !authData.user) {
      const mock = await mockSaveMemberRole(role);
      if (!mock.error) {
        notifyAuthChanged();
        return mock;
      }
      return fail(null, '로그인이 필요합니다.');
    }

    const user = authData.user;
    const email = user.email?.trim() || '';
    const name =
      (typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : '') || email.split('@')[0] || '회원';

    const payload = {
      id: user.id,
      name,
      email,
      role,
      status: 'active' as const,
    };

    const { data, error } = await supabase
      .from('profiles')
      .upsert(payload, { onConflict: 'id' })
      .select(PROFILE_COLUMNS)
      .maybeSingle();

    if (error) {
      console.warn('[SponsorAuction] 역할 저장에 실패했습니다.', error.message);
      if (isSchemaMismatch(error)) {
        const mock = await mockSaveMemberRole(role);
        if (!mock.error) {
          notifyAuthChanged();
          return mock;
        }
      }
      return fail(null, AUTH_FAIL_MESSAGE);
    }

    const row = (data ?? payload) as ProfileRow;
    const session = mapSessionUser(
      user.id,
      row.email?.trim() || email,
      row.name?.trim() || name,
      row.role,
    );
    notifyAuthChanged();
    return ok(session);
  } catch (error) {
    console.warn('[SponsorAuction] 역할 저장 중 예외가 발생했습니다.', error);
    return fail(null, AUTH_FAIL_MESSAGE);
  }
}
