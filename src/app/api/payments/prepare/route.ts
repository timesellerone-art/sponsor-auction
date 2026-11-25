import { rethrowPrerenderError } from '@/lib/prerender-error';
import { NextResponse } from 'next/server';
import {
  campaignPayReference,
  holdCampaignPayment,
  releaseCampaignCredit,
  releaseCampaignPaymentIfOpen,
} from '@/lib/campaign-credit';
import { advertiserChargeMatchesBid, advertiserTotalCharge } from '@/lib/fees';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/uuid';
import { productionTossLiveKeyError } from '@/lib/launch-env';
import { getTossClientKey, getTossSecretKey, isTossClientConfigured } from '@/lib/payments/env';
import {
  PAYMENT_INTENT_COOKIE,
  PAYMENT_INTENT_TTL_MS,
  createOrderId,
  encodeIntentCookie,
  putIntent,
  sanitizeCustomerKey,
} from '@/lib/payments/intent';
import { MAX_BID_AMOUNT } from '@/lib/validation';
import {
  canPreparePayment,
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { persistPayment } from '@/lib/payments/persist';
import { paymentDbConfigForRequest } from '@/lib/supabase/payment-config';
import { hasAuthRole } from '@/types/auth';
import type { PreparePaymentInput, PreparePaymentResult } from '@/types/payment';


function parseBody(value: unknown): PreparePaymentInput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as Record<string, unknown>;
  const auctionId = typeof body.auctionId === 'string' ? body.auctionId.trim() : '';
  const bidId = typeof body.bidId === 'string' ? body.bidId.trim() : '';
  const amount = typeof body.amount === 'number' ? body.amount : Number.NaN;
  const bidAmount = typeof body.bidAmount === 'number' ? body.bidAmount : Number.NaN;
  const orderName = typeof body.orderName === 'string' ? body.orderName.trim() : '';
  const customerKey = typeof body.customerKey === 'string' ? body.customerKey : '';
  const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : '';
  const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : '';

  if (!auctionId || !bidId || !orderName || !Number.isInteger(amount)) {
    return null;
  }

  return {
    auctionId,
    bidId,
    amount,
    bidAmount: Number.isInteger(bidAmount) && bidAmount > 0 ? bidAmount : undefined,
    orderName,
    customerKey,
    supabaseUrl,
    supabaseAnonKey,
  };
}

export async function POST(request: Request) {
  try {
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('결제를 준비하려면 로그인해 주세요.');
    }
    if (!canPreparePayment(actor)) {
      return forbiddenJson('결제 준비는 광고주 계정만 할 수 있습니다.');
    }

    const liveKeyError = productionTossLiveKeyError(process.env, {
      clientKey: getTossClientKey(),
      secretKey: getTossSecretKey(),
    });
    if (liveKeyError) {
      return NextResponse.json(
        {
          error:
            liveKeyError === 'TOSS_TEST_KEY_IN_PRODUCTION'
              ? '운영 환경에는 토스페이먼츠 live_ 키를 등록해야 합니다. test_ 키로는 실결제를 진행할 수 없습니다.'
              : '운영 환경에 토스페이먼츠 라이브 키가 없습니다. Vercel Production 환경 변수를 확인해 주세요.',
          errorCode: liveKeyError,
        },
        { status: 503 },
      );
    }

    const parsed = parseBody(await request.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json(
        { error: '주문 정보가 올바르지 않습니다.' },
        { status: 400 },
      );
    }

    if (parsed.amount < 100 || parsed.amount > advertiserTotalCharge(MAX_BID_AMOUNT)) {
      return NextResponse.json(
        { error: '결제 금액이 허용 범위를 벗어났습니다.' },
        { status: 400 },
      );
    }

    if (
      typeof parsed.bidAmount === 'number' &&
      parsed.bidAmount > 0 &&
      !advertiserChargeMatchesBid(parsed.bidAmount, parsed.amount)
    ) {
      return NextResponse.json(
        { error: '결제 금액이 낙찰가와 수수료 정책에 맞지 않습니다.' },
        { status: 400 },
      );
    }

    const intent = {
      orderId: createOrderId(),
      auctionId: parsed.auctionId,
      bidId: parsed.bidId,
      amount: parsed.amount,
      bidAmount: parsed.bidAmount,
      orderName: parsed.orderName.slice(0, 100),
      status: 'pending' as const,
      paymentKey: null,
      createdAt: Date.now(),
    };

    if (isUuid(intent.auctionId) && isUuid(intent.bidId)) {
      if (!actor.userId) {
        return NextResponse.json(
          { error: '결제를 준비하려면 로그인해 주세요.', errorCode: 'UNAUTHORIZED' },
          { status: 401 },
        );
      }
      const admin = createAdminClient();
      if (!admin) {
        return NextResponse.json(
          {
            error: '크레딧 원장을 확인하지 못했습니다. 채택은 진행되지 않았습니다.',
            errorCode: 'CREDIT_LEDGER_UNAVAILABLE',
          },
          { status: 503 },
        );
      }
      const held = await holdCampaignPayment(admin, {
        orderId: intent.orderId,
        auctionId: intent.auctionId,
        bidId: intent.bidId,
        actorUserId: actor.userId,
        actorIsAdmin: hasAuthRole(actor, 'admin'),
      });
      if (!held.ok) {
        const status =
          held.code === 'INSUFFICIENT_CREDIT' ? 402 : held.code === 'ALREADY_AWARDED' ? 409 : held.code === 'FORBIDDEN' ? 403 : 400;
        return NextResponse.json({ error: held.message, errorCode: held.code }, { status });
      }
      if (!held.skipped && held.amount !== intent.amount) {
        await releaseCampaignCredit(admin, {
          referenceId: campaignPayReference(intent.orderId),
          reason: '결제 금액이 차감 금액과 달라 채택을 취소',
        });
        return NextResponse.json(
          {
            error: '결제 금액이 제안 금액과 수수료에 맞지 않습니다. 채택은 진행되지 않았습니다.',
            errorCode: 'AMOUNT_MISMATCH',
          },
          { status: 400 },
        );
      }
    }

    putIntent(intent);
    const dbConfig = await paymentDbConfigForRequest({
      supabaseUrl: parsed.supabaseUrl,
      supabaseAnonKey: parsed.supabaseAnonKey,
    });
    const pending = await persistPayment(intent, 'pending', null, dbConfig);
    if (!pending.ok) {
      console.error('[SponsorAuction] pending payment 저장 실패', pending);
      if (process.env.VERCEL_ENV === 'production') {
        const admin = createAdminClient();
        if (admin) {
          await releaseCampaignPaymentIfOpen(admin, {
            orderId: intent.orderId,
            auctionId: intent.auctionId,
            bidId: intent.bidId,
            reason: '결제 준비 저장 실패로 크레딧 복구',
          });
        }
        return NextResponse.json(
          {
            error: pending.errorMessage,
            errorCode: pending.errorCode,
          },
          { status: 500 },
        );
      }
    }

    const result: PreparePaymentResult = {
      orderId: intent.orderId,
      amount: intent.amount,
      bidAmount: intent.bidAmount,
      orderName: intent.orderName,
      customerKey: sanitizeCustomerKey(parsed.customerKey),
      clientKey: getTossClientKey() || null,
      demo: !isTossClientConfigured(),
      auctionId: intent.auctionId,
      bidId: intent.bidId,
    };

    const response = NextResponse.json(result);
    response.cookies.set(PAYMENT_INTENT_COOKIE, encodeIntentCookie(intent), {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: Math.floor(PAYMENT_INTENT_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    rethrowPrerenderError(error);
    console.warn('[SponsorAuction] 결제 준비 중 예외가 발생했습니다.', error);
    return NextResponse.json(
      { error: '결제를 준비하지 못했습니다. 다시 시도해 주세요.' },
      { status: 500 },
    );
  }
}
