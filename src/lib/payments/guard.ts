import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ROLE_COOKIE_NAME } from '@/lib/access';
import { createClient } from '@/lib/supabase/server';
import type { AuthProfileRole } from '@/types/auth';

export type PaymentActor = {
  role: AuthProfileRole;
  userId?: string;
};

function asRole(value: string): AuthProfileRole | null {
  if (value === 'advertiser' || value === 'creator' || value === 'admin') {
    return value;
  }
  return null;
}

export async function getPaymentActor(): Promise<PaymentActor | null> {
  const cookieStore = await cookies();
  const cookieRole = asRole(cookieStore.get(ROLE_COOKIE_NAME)?.value ?? '');
  if (cookieRole) {
    return { role: cookieRole };
  }

  try {
    const supabase = await createClient();
    if (!supabase) {
      return null;
    }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return null;
    }
    return { role: 'advertiser', userId: data.user.id };
  } catch {
    return null;
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
  return actor?.role === 'advertiser' || actor?.role === 'admin';
}
