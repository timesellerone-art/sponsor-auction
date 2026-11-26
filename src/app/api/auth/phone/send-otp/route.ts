import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import { getApiAuthUser } from '@/lib/auth-api-user';
import { issuePhoneOtp } from '@/lib/phone-otp-admin';
import { clientIp, consumeKeyedRateLimit, consumeRateLimit } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(request: NextRequest) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/auth/phone/send-otp');
    if (!limited.allowed) {
      return NextResponse.json(
        { error: '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: NO_STORE },
      );
    }

    const body = (await request.json().catch(() => null)) as { phone?: string } | null;
    const phone = body?.phone?.trim() ?? '';

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

    const otpLimit = consumeKeyedRateLimit(`phone-otp:${user.id}`, 5, 10 * 60_000);
    if (!otpLimit.allowed) {
      return NextResponse.json(
        { error: '인증번호 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.' },
        { status: 429, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '인증번호를 발송할 수 있는 관리자 키가 없습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const issued = await issuePhoneOtp(admin, user, phone);
    return NextResponse.json(
      { data: { phone: issued.phone, sent: true, testMode: issued.testMode } },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    console.warn('[SponsorAuction] 휴대폰 OTP 발송 예외', error);
    const message = error instanceof Error ? error.message : '인증번호를 보내지 못했습니다.';
    const status =
      message.includes('휴대전화') || message.includes('인증번호') || message.includes('문자 발송')
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status, headers: NO_STORE });
  }
}
