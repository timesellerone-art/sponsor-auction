import { rethrowPrerenderError } from '@/lib/prerender-error';
import { timingSafeEqual } from 'crypto';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  ensureCreditLedgerTestUser,
  resetCreditLedger,
  runCreditLedgerScenarios,
} from '@/lib/credits';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';


const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function creditTestSecret() {
  return (process.env.CREDIT_TEST_SECRET || '').trim();
}

function providedSecret(request: Request) {
  const header = request.headers.get('x-credit-test-key')?.trim() ?? '';
  if (header) {
    return header;
  }
  const auth = request.headers.get('authorization') ?? '';
  const bearer = auth.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1]?.trim() || '';
}

function authorize(request: Request) {
  const expected = creditTestSecret();
  if (!expected) {
    return false;
  }
  const provided = providedSecret(request);
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  if (left.length === 0 || left.length !== right.length) {
    return false;
  }
  try {
    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 검증 API는 동적 렌더 힌트와 무관하게 처리합니다.
    }

    if (!creditTestSecret()) {
      return NextResponse.json({ error: 'Not Found' }, { status: 404, headers: NO_STORE });
    }
    if (!authorize(request)) {
      return NextResponse.json({ error: '인증에 실패했습니다.' }, { status: 401, headers: NO_STORE });
    }

    const limited = consumeRateLimit(clientIp(request), '/api/credits/test');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: 'Supabase 관리자 클라이언트를 만들지 못했습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const user = await ensureCreditLedgerTestUser(admin);
    await resetCreditLedger(admin, user.id);
    const scenarios = await runCreditLedgerScenarios(admin, user.id);

    return NextResponse.json(
      {
        user,
        passed: scenarios.every((item) => item.passed),
        scenarios,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '크레딧 검증에 실패했습니다.';
    console.error('[SponsorAuction] 크레딧 원장 검증 실패', error);
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}
