import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import { applyAuthCookies } from '@/lib/access';
import { completeVerifiedPhone } from '@/lib/account-delete';
import { AccountMergeUnavailableError } from '@/lib/auth-identity';
import { getApiAuthUser } from '@/lib/auth-api-user';
import { linkedAccountsPayload } from '@/lib/auth-identities';
import { confirmPhoneOtp } from '@/lib/phone-otp-admin';
import { isVerifiedServicePhone } from '@/lib/phone-otp';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/identities/phone');
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
        { error: '휴대전화를 등록할 수 있는 관리자 키가 없습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    if (!isVerifiedServicePhone(user, phone)) {
      if (!code) {
        return NextResponse.json(
          { error: '인증번호를 입력해 주세요.' },
          { status: 400, headers: NO_STORE },
        );
      }
      await confirmPhoneOtp(admin, user, phone, code);
    }

    const result = await completeVerifiedPhone(admin, user, phone);
    const response = NextResponse.json(
      {
        data: {
          ...linkedAccountsPayload(result.user),
          merged: result.merged,
          message: result.message,
          roles: result.roles,
          onboardingComplete: result.onboardingComplete,
        },
        sessionSwitch: result.tokenHash ? { tokenHash: result.tokenHash } : undefined,
      },
      { headers: NO_STORE },
    );
    applyAuthCookies(response.cookies, {
      present: true,
      roles: result.roles,
      activeRole: result.roles[0] ?? null,
      hostname: request.headers.get('x-forwarded-host') || request.headers.get('host'),
    });
    return response;
  } catch (error) {
    rethrowPrerenderError(error);
    if (error instanceof AccountMergeUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 503, headers: NO_STORE });
    }
    console.warn('[SponsorAuction] 휴대전화 연동 예외', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '휴대전화를 연동하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
