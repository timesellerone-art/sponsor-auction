import { syncAuthPresentCookie, syncRoleCookie } from '@/lib/access';
import {
  isAuthProfileRole,
  isMemberRole,
  type MemberRole,
  type SessionUser,
} from '@/types/auth';
import type { DataResult } from '@/types/auction';

type MockAccount = {
  password: string;
  user: SessionUser;
};

const STORAGE_KEY = 'sponsor-auction-auth-session';

const accounts = new Map<string, MockAccount>([
  [
    'brand@demo.com',
    {
      password: 'demo1234',
      user: {
        id: 'usr-demo-advertiser',
        email: 'brand@demo.com',
        name: '데모 광고주',
        role: 'advertiser',
      },
    },
  ],
  [
    'creator@demo.com',
    {
      password: 'demo1234',
      user: {
        id: 'usr-demo-creator',
        email: 'creator@demo.com',
        name: '데모 크리에이터',
        role: 'creator',
      },
    },
  ],
  [
    'admin@demo.com',
    {
      password: 'demo1234',
      user: {
        id: 'usr-demo-admin',
        email: 'admin@demo.com',
        name: '데모 관리자',
        role: 'admin',
      },
    },
  ],
]);

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function persistSession(user: SessionUser | null) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    if (!user) {
      window.localStorage.removeItem(STORAGE_KEY);
      syncRoleCookie(null);
      syncAuthPresentCookie(false);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    syncRoleCookie(user.role);
    syncAuthPresentCookie(true);
  } catch {
    // 저장 실패해도 이번 세션 메모리 값은 유지합니다.
  }
}

export function readMockSession(): SessionUser | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    if (
      typeof parsed.id !== 'string' ||
      typeof parsed.email !== 'string' ||
      typeof parsed.name !== 'string'
    ) {
      return null;
    }

    const session = {
      id: parsed.id,
      email: parsed.email,
      name: parsed.name,
      role: isAuthProfileRole(parsed.role) ? parsed.role : null,
    };
    syncRoleCookie(session.role);
    return session;
  } catch {
    return null;
  }
}

export async function mockGetSession(): Promise<DataResult<SessionUser | null>> {
  try {
    return ok(readMockSession());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '세션을 불러오지 못했습니다.';
    return fail(null, message);
  }
}

export async function mockSignUp(input: {
  name: string;
  email: string;
  password: string;
}): Promise<DataResult<SessionUser | null>> {
  try {
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    const password = input.password;

    if (!name) {
      return fail(null, '이름을 입력해 주세요.');
    }
    if (!email || !email.includes('@')) {
      return fail(null, '올바른 이메일을 입력해 주세요.');
    }
    if (password.trim().length < 6) {
      return fail(null, '비밀번호는 6자 이상이어야 합니다.');
    }
    if (accounts.has(email)) {
      return fail(null, '이미 가입된 이메일입니다.');
    }

    const user: SessionUser = {
      id: `usr-${Date.now()}`,
      email,
      name,
      role: null,
    };
    accounts.set(email, { password, user });
    persistSession(user);
    return ok(user);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '회원가입에 실패했습니다.';
    return fail(null, message);
  }
}

export async function mockSignIn(input: {
  email: string;
  password: string;
}): Promise<DataResult<SessionUser | null>> {
  try {
    const email = normalizeEmail(input.email);
    const account = accounts.get(email);
    if (!account || account.password !== input.password) {
      return fail(null, '이메일 또는 비밀번호가 올바르지 않습니다.');
    }

    persistSession(account.user);
    return ok(account.user);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '로그인에 실패했습니다.';
    return fail(null, message);
  }
}

export async function mockSignOut(): Promise<DataResult<boolean>> {
  try {
    persistSession(null);
    return ok(true);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '로그아웃에 실패했습니다.';
    return fail(false, message);
  }
}

export async function mockSaveMemberRole(
  role: MemberRole,
): Promise<DataResult<SessionUser | null>> {
  try {
    if (!isMemberRole(role)) {
      return fail(null, '광고주 또는 크리에이터 역할을 선택해 주세요.');
    }

    const current = readMockSession();
    if (!current) {
      return fail(null, '로그인이 필요합니다.');
    }

    const updated: SessionUser = { ...current, role };
    const account = accounts.get(normalizeEmail(current.email));
    if (account) {
      accounts.set(normalizeEmail(current.email), {
        password: account.password,
        user: updated,
      });
    }
    persistSession(updated);
    return ok(updated);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '역할 저장에 실패했습니다.';
    return fail(null, message);
  }
}
