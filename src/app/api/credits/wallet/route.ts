import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { CREDIT_CHARGE_AMOUNTS } from '@/lib/credit-charge';
import { getCreditBalance, listCreditTransactions, summarizeCreditTransactions } from '@/lib/credits';
import { canPreparePayment, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';


const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function GET(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 지갑 조회는 동적 렌더 힌트와 무관하게 처리합니다.
    }

    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('크레딧을 보려면 로그인해 주세요.');
    }

    const limited = consumeRateLimit(clientIp(request), '/api/credits/wallet');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '크레딧 원장을 조회하지 못했습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    const balance = await getCreditBalance(admin, actor.userId);
    const transactions = summarizeCreditTransactions(await listCreditTransactions(admin, actor.userId));
    return NextResponse.json(
      {
        balance: balance ?? 0,
        transactions,
        amounts: CREDIT_CHARGE_AMOUNTS,
        canCharge: canPreparePayment(actor),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '크레딧을 조회하지 못했습니다.';
    console.error('[SponsorAuction] 크레딧 지갑 조회 실패', error);
    return NextResponse.json({ error: message, errorCode: 'WALLET_FAILED' }, { status: 500, headers: NO_STORE });
  }
}
