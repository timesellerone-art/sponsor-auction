import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ROLE_COOKIE_NAME } from '@/lib/access';
import { createClient } from '@/lib/supabase/server';
import { parseAuthRoles, primaryAuthRole, type AuthProfileRole } from '@/types/auth';

export type PaymentActor = {
  role: AuthProfileRole;
  roles: AuthProfileRole[];
  userId?: string;
};

export async function getPaymentActor(): Promise<PaymentActor | null> {
  const cookieStore = await cookies();
  const cookieRoles = parseAuthRoles(cookieStore.get(ROLE_COOKIE_NAME)?.value ?? '');
  const cookieRole = primaryAuthRole(cookieRoles);

  try {
    const supabase = await createClient();
    if (supabase) {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, roles')
          .eq('id', data.user.id)
          .maybeSingle();
        const roles = parseAuthRoles(profile?.roles, profile?.role);
        const profileRole = primaryAuthRole(roles);
        if (profileRole) {
          return { role: profileRole, roles, userId: data.user.id };
        }
        return null;
      }
    }
  } catch {
    // 데모/로컬은 역할 쿠키만으로 API 가드를 통과시킨다.
  }

  if (cookieRole) {
    return { role: cookieRole, roles: cookieRoles };
  }

  return null;
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
