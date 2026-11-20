import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACTIVE_ROLE_COOKIE_NAME, ACTIVE_ROLE_HEADER, lastCookieValue, ROLE_COOKIE_NAME } from '@/lib/access';
import { createAdminClient } from '@/lib/supabase/admin';
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

function cookieOnlyActor(roles: AuthProfileRole[], activeRole: MemberRole | null): PaymentActor | null {
  const role = primaryAuthRole(roles);
  if (!role || process.env.NODE_ENV === 'production') {
    return null;
  }
  return { role, roles, activeRole };
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
    const supabase = await createClient();
    if (!supabase) {
      return cookieOnlyActor(cookieRoles, requestActiveRole(request, undefined, activeCookie));
    }

    const token = bearerToken(request);
    let user: { id: string; user_metadata?: Record<string, unknown> } | null = null;
    if (token) {
      const byToken = await supabase.auth.getUser(token);
      if (!byToken.error && byToken.data.user) {
        user = byToken.data.user;
      }
    }
    if (!user) {
      const byCookie = await supabase.auth.getUser();
      if (!byCookie.error && byCookie.data.user) {
        user = byCookie.data.user;
      }
    }
    if (!user) {
      return cookieOnlyActor(cookieRoles, requestActiveRole(request, undefined, activeCookie));
    }

    const reader = createAdminClient() ?? supabase;
    const { data: profile } = await reader
      .from('profiles')
      .select('role, roles')
      .eq('id', user.id)
      .maybeSingle();
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
    { status: 401 },
  );
}

export function forbiddenJson(message = '이 요청을 수행할 권한이 없습니다.') {
  return NextResponse.json(
    {
      error: `[FORBIDDEN] ${message}`,
      errorCode: 'FORBIDDEN',
      errorMessage: message,
    },
    { status: 403 },
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
