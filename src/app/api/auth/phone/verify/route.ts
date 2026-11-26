import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import { completeVerifiedPhone } from '@/lib/account-delete';
import { AccountMergeUnavailableError } from '@/lib/auth-identity';
import { getApiAuthUser } from '@/lib/auth-api-user';
import { linkedAccountsPayload } from '@/lib/auth-identities';
import { confirmPhoneOtp } from '@/lib/phone-otp-admin';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/phone/verify');
    if (!limited.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: NO_STORE },
      );
    }

    const body = (await request.json().catch(() => null)) as { phone?: string; code?: string } | null;
    const phone = body?.phone?.trim() ?? '';
    const code = body?.code?.trim() ?? '';

    const { user, error } = await getApiAuthUser(request);
    if (error === 'unconfigured') {
      return NextResponse.json(
        { error: 'Supabase가 설정되지 않았습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }
    if (!user) {
      return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401, headers: NO_STORE });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '휴대전화를 확인할 수 있는 관리자 키가 없습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const verifiedPhone = await confirmPhoneOtp(admin, user, phone, code);
    const result = await completeVerifiedPhone(admin, user, verifiedPhone);
    const roles = result.roles;
    const currentMode = roles[0] ?? null;
    const hostname = request.headers.get('x-forwarded-host') || request.headers.get('host');

    const response = NextResponse.json(
      {
        data: {
          ...(result.user ? linkedAccountsPayload(result.user) : {}),
          id: result.user?.id ?? null,
          duplicate: result.duplicate,
          deleted: result.deleted,
          existingMethods: result.existingMethods,
          merged: result.merged,
          message: result.message,
          roles,
          onboardingComplete: result.onboardingComplete,
        },
        sessionSwitch: result.tokenHash ? { tokenHash: result.tokenHash } : undefined,
      },
      { headers: NO_STORE },
    );
    applyAuthCookies(response.cookies, {
      present: !result.deleted,
      roles,
      activeRole: result.deleted ? null : currentMode,
      hostname,
    });
    return response;
  } catch (error) {
    rethrowPrerenderError(error);
    if (error instanceof AccountMergeUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503, headers: NO_STORE });
    }
    console.warn('[SponsorAuction] 휴대폰 OTP 확인 예외', error);
    const message = error instanceof Error ? error.message : '휴대전화를 확인하지 못했습니다.';
    const status =
      message.includes('인증번호') || message.includes('휴대전화') || message.includes('번호')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
