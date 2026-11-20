import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ROLE_COOKIE_NAME } from '@/lib/access';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { parseAuthRoles, primaryAuthRole, type AuthProfileRole } from '@/types/auth';

export type PaymentActor = {
  role: AuthProfileRole | null;
  roles: AuthProfileRole[];
  userId?: string;
};

function bearerToken(request?: Request) {
  const match = request?.headers.get('authorization')?.trim().match(/^Bearer\s+(\S+)/i);
  return match?.[1] ?? '';
}

function cookieOnlyActor(roles: AuthProfileRole[]): PaymentActor | null {
  const role = primaryAuthRole(roles);
  if (!role || process.env.NODE_ENV === 'production') {
    return null;
  }
  return { role, roles };
}

export async function getPaymentActor(request?: Request): Promise<PaymentActor | null> {
  const cookieStore = await cookies();
  const cookieRoles = parseAuthRoles(cookieStore.get(ROLE_COOKIE_NAME)?.value ?? '');

  try {
    const supabase = await createClient();
    if (!supabase) {
      return cookieOnlyActor(cookieRoles);
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
      return cookieOnlyActor(cookieRoles);
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
    };
  } catch {
    return cookieOnlyActor(cookieRoles);
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
