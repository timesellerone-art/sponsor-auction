import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACTIVE_ROLE_COOKIE_NAME, ACTIVE_ROLE_HEADER, lastCookieValue, ROLE_COOKIE_NAME } from '@/lib/access';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSupabaseEnv } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';
import {
  allowsCreditCharge,
  isMemberRole,
  parseAuthRoles,
  primaryAuthRole,
  type AuthProfileRole,
  type MemberRole,
} from '@/types/auth';

export type PaymentActor = {
  role: AuthProfileRole | null;
  roles: AuthProfileRole[];
  userId?: string;
  activeRole?: MemberRole | null;
};

function bearerToken(request?: Request) {
  const match = request?.headers.get('authorization')?.trim().match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? '';
}

function requestActiveRole(
  request: Request | undefined,
  metadata: Record<string, unknown> | undefined,
  cookieValue: string,
): MemberRole | null {
  const header = request?.headers.get(ACTIVE_ROLE_HEADER)?.trim();
  if (isMemberRole(header)) {
    return header;
  }
  if (isMemberRole(cookieValue)) {
    return cookieValue;
  }
  if (isMemberRole(metadata?.current_mode)) {
    return metadata.current_mode;
  }
  return null;
}

const AUTH_JSON_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function cookieOnlyActor(roles: AuthProfileRole[], activeRole: MemberRole | null): PaymentActor | null {
  const role = primaryAuthRole(roles);
  if (!role || process.env.NODE_ENV === 'production') {
    return null;
  }
  return { role, roles, activeRole };
}

async function userFromBearerToken(token: string) {
  if (!token) {
    return null;
  }

  const admin = createAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin.auth.getUser(token);
      if (!error && data.user) {
        return data.user;
      }
    } catch {
      // 쿠키 세션으로 이어갑니다.
    }
  }

  const env = getSupabaseEnv();
  if (!env) {
    return null;
  }
  try {
    const response = await fetch(`${env.url}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.anonKey,
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json().catch(() => null)) as {
      id?: string;
      user_metadata?: Record<string, unknown>;
    } | null;
    return payload?.id ? payload : null;
  } catch {
    return null;
  }
}

async function userFromCookieSession() {
  try {
    const supabase = await createClient();
    if (!supabase) {
      return null;
    }
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user) {
      return data.user;
    }
  } catch {
    // Bearer 검증과 분리합니다.
  }
  return null;
}

export async function getPaymentActor(request?: Request): Promise<PaymentActor | null> {
  const cookieStore = await cookies();
  const headerCookies = request?.headers.get('cookie') ?? '';
  const cookieRoles = parseAuthRoles(
    lastCookieValue(headerCookies, ROLE_COOKIE_NAME) || cookieStore.get(ROLE_COOKIE_NAME)?.value || '',
  );
  const activeCookie =
    lastCookieValue(headerCookies, ACTIVE_ROLE_COOKIE_NAME) ||
    cookieStore.get(ACTIVE_ROLE_COOKIE_NAME)?.value ||
    '';

  try {
    const user =
      (await userFromBearerToken(bearerToken(request))) ?? (await userFromCookieSession());
    if (!user?.id) {
      return cookieOnlyActor(cookieRoles, requestActiveRole(request, undefined, activeCookie));
    }

    const reader = createAdminClient() ?? (await createClient());
    const { data: profile } = reader
      ? await reader.from('profiles').select('role, roles').eq('id', user.id).maybeSingle()
      : { data: null };
    const roles = parseAuthRoles(
      profile?.roles,
      profile?.role,
      user.user_metadata?.roles,
      user.user_metadata?.role,
      cookieRoles,
    );
    return {
      role: primaryAuthRole(roles),
      roles,
      userId: user.id,
      activeRole: requestActiveRole(request, user.user_metadata, activeCookie),
    };
  } catch {
    return cookieOnlyActor(cookieRoles, requestActiveRole(request, undefined, activeCookie));
  }
}

export function unauthorizedJson(message = '로그인이 필요합니다.') {
  return NextResponse.json(
    {
      error: `[UNAUTHORIZED] ${message}`,
      errorCode: 'UNAUTHORIZED',
      errorMessage: message,
    },
    { status: 401, headers: AUTH_JSON_HEADERS },
  );
}

export function forbiddenJson(message = '이 요청을 수행할 권한이 없습니다.') {
  return NextResponse.json(
    {
      error: `[FORBIDDEN] ${message}`,
      errorCode: 'FORBIDDEN',
      errorMessage: message,
    },
    { status: 403, headers: AUTH_JSON_HEADERS },
  );
}

export function canPreparePayment(actor: PaymentActor | null) {
  const roles = parseAuthRoles(actor);
  return roles.includes('advertiser') || roles.includes('admin');
}

export function canChargeCredit(actor: PaymentActor | null) {
  return allowsCreditCharge({
    userId: actor?.userId,
    activeRole: actor?.activeRole,
    roles: actor,
  });
}
