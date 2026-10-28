import 'server-only';

import type { User } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerSupabase } from '@/lib/supabase/server';
import {
  profileNameFromUser,
  resolveProfileEmail,
} from '@/lib/supabase/profile-sync';
import { memberRolesFromInput, type MemberRole } from '@/types/auth';

export type OnboardingBody = {
  role?: unknown;
  roles?: unknown;
  name?: string;
  email?: string;
  phone?: string;
};

export function bearerToken(request: Request) {
  const header = request.headers.get('authorization') ?? '';
  const matched = header.match(/^Bearer\s+(\S+)/i);
  return matched?.[1]?.trim() ?? '';
}

export function parseOnboardingRoles(body: OnboardingBody | null): MemberRole[] {
  return memberRolesFromInput(body?.role, body?.roles);
}

async function userFromBearer(token: string) {
  if (!token) {
    return null;
  }
  const admin = createAdminClient();
  if (!admin) {
    return null;
  }
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }
  return data.user;
}

async function userFromCookieSession() {
  const serverClient = await createServerSupabase();
  const { data } = (await serverClient?.auth.getUser()) ?? { data: { user: null } };
  return data.user ?? null;
}

export async function resolveOnboardingActor(
  request: Request,
  body: OnboardingBody | null,
): Promise<
  | { ok: true; admin: NonNullable<ReturnType<typeof createAdminClient>>; user: User; email: string; name: string }
  | { ok: false; status: number; error: string }
> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, status: 503, error: '프로필을 저장할 수 없습니다.' };
  }

  const user =
    (await userFromBearer(bearerToken(request))) ?? (await userFromCookieSession());
  if (!user) {
    return { ok: false, status: 401, error: '로그인이 필요합니다.' };
  }

  const email = resolveProfileEmail(user.id, body?.email, user.email);
  const name =
    body?.name?.trim() || profileNameFromUser(user, email.split('@')[0] || '회원');

  return { ok: true, admin, user, email, name };
}
