import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { isTossSecretConfigured } from '@/lib/payments/env';
import {
  PAYMENT_INTENT_COOKIE,
  getIntent,
  putIntent,
  resolveIntent,
  updateIntent,
} from '@/lib/payments/intent';
import { applyPaidAuctionStatus } from '@/lib/payments/apply-paid-status';
import { canPreparePayment, getPaymentActor } from '@/lib/payments/guard';
import { persistPayment } from '@/lib/payments/persist';
import { confirmTossPayment, isDemoPaymentKey } from '@/lib/payments/toss';
import { paymentDbConfigForRequest } from '@/lib/supabase/payment-config';
import type { ConfirmPaymentInput, ConfirmPaymentResult } from '@/types/payment';

function jsonError(
  status: number,
  errorCode: string,
  errorMessage: string,
  extra?: Record<string, unknown>,
) {
  return NextResponse.json(
    {
      error: `[${errorCode}] ${errorMessage}`,
      errorCode,
      errorMessage,
      ...extra,
    },
    { status },
  );
}

function parseBody(value: unknown): ConfirmPaymentInput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const body = value as Record<string, unknown>;
  const paymentKey = typeof body.paymentKey === 'string' ? body.paymentKey.trim() : '';
  const orderId = typeof body.orderId === 'string' ? body.orderId.trim() : '';
  const amount = Number(body.amount);
  const supabaseUrl = typeof body.supabaseUrl === 'string' ? body.supabaseUrl.trim() : '';
  const supabaseAnonKey = typeof body.supabaseAnonKey === 'string' ? body.supabaseAnonKey.trim() : '';
  const auctionId =
    (typeof body.auctionId === 'string' ? body.auctionId.trim() : '') ||
    (typeof body.auction_id === 'string' ? body.auction_id.trim() : '');
  const bidId =
    (typeof body.bidId === 'string' ? body.bidId.trim() : '') ||
    (typeof body.bid_id === 'string' ? body.bid_id.trim() : '');

  if (!paymentKey || !orderId || !Number.isInteger(amount) || amount <= 0) {
    return null;
  }

  return { paymentKey, orderId, amount, auctionId, bidId, supabaseUrl, supabaseAnonKey };
}

export async function POST(request: Request) {
  try {
    const actor = await getPaymentActor();
    if (!actor) {
      return jsonError(401, 'UNAUTHORIZED', '결제를 승인하려면 로그인해 주세요.');
    }
    if (!canPreparePayment(actor)) {
      return jsonError(403, 'FORBIDDEN', '결제 승인은 광고주 계정만 할 수 있습니다.');
    }

    const parsed = parseBody(await request.json().catch(() => null));
    if (!parsed) {
      console.error('[SponsorAuction] 결제 승인 요청 본문이 올바르지 않습니다.');
      return jsonError(400, 'INVALID_CONFIRM_BODY', '결제 승인 정보가 올바르지 않습니다.');
    }

    const dbConfig = await paymentDbConfigForRequest({
      supabaseUrl: parsed.supabaseUrl,
      supabaseAnonKey: parsed.supabaseAnonKey,
    });

    console.info('[SponsorAuction] 결제 승인 요청', {
      orderId: parsed.orderId,
      amount: parsed.amount,
      auctionId: parsed.auctionId,
      bidId: parsed.bidId,
      paymentKeyPrefix: parsed.paymentKey.slice(0, 8),
      tossSecretConfigured: isTossSecretConfigured(),
      supabase: {
        hasUrl: Boolean(dbConfig.url),
        hasServiceKey: Boolean(dbConfig.serviceKey),
        hasAnonKey: Boolean(dbConfig.anonKey),
        usedClientFallback: Boolean(parsed.supabaseUrl && !process.env.NEXT_PUBLIC_SUPABASE_URL),
      },
    });

    const cookieStore = await cookies();
    let intent = resolveIntent(
      parsed.orderId,
      cookieStore.get(PAYMENT_INTENT_COOKIE)?.value,
    );

    const auctionId = parsed.auctionId || intent?.auctionId || '';
    const bidId = parsed.bidId || intent?.bidId || '';

    if (!intent && auctionId && bidId) {
      intent = {
        orderId: parsed.orderId,
        auctionId,
        bidId,
        amount: parsed.amount,
        orderName: '역경매 낙찰',
        status: 'pending',
        paymentKey: null,
        createdAt: Date.now(),
      };
      putIntent(intent);
    }

    if (!intent) {
      console.error('[SponsorAuction] 결제 승인 실패: intent 없음', {
        orderId: parsed.orderId,
        amount: parsed.amount,
        auctionId,
        bidId,
      });
      return jsonError(
        409,
        'INTENT_NOT_FOUND',
        '결제 요청이 만료되었거나 찾을 수 없습니다. 낙찰은 진행되지 않았습니다.',
      );
    }

    intent = {
      ...intent,
      auctionId: auctionId || intent.auctionId,
      bidId: bidId || intent.bidId,
    };
    putIntent(intent);

    if (!intent.auctionId || !intent.bidId) {
      console.error('[SponsorAuction] 결제 승인 실패: auctionId/bidId 없음', {
        orderId: parsed.orderId,
        auctionId: intent.auctionId,
        bidId: intent.bidId,
      });
      return jsonError(
        400,
        'PAYMENT_IDS_MISSING',
        '경매/입찰 정보가 없어 결제를 확정할 수 없습니다. 낙찰은 진행되지 않았습니다.',
      );
    }

    if (intent.amount !== parsed.amount) {
      console.error('[SponsorAuction] 결제 승인 실패: 금액 불일치', {
        orderId: parsed.orderId,
        requestedAmount: parsed.amount,
        intentAmount: intent.amount,
      });
      updateIntent(intent.orderId, { status: 'failed' });
      await persistPayment(intent, 'failed', parsed.paymentKey, dbConfig);
      return jsonError(
        409,
        'AMOUNT_MISMATCH',
        '결제 금액이 주문 정보와 일치하지 않습니다. 낙찰은 진행되지 않았습니다.',
      );
    }

    const existing = getIntent(intent.orderId);
    if (existing?.status === 'confirmed') {
      if (existing.paymentKey && existing.paymentKey !== parsed.paymentKey) {
        console.error('[SponsorAuction] 결제 승인 실패: 이미 다른 paymentKey로 처리됨', {
          orderId: parsed.orderId,
        });
        return jsonError(
          409,
          'ALREADY_CONFIRMED_OTHER_KEY',
          '이미 다른 결제로 처리된 주문입니다.',
        );
      }

      const replayKey = existing.paymentKey ?? parsed.paymentKey;
      const replaySaved = await persistPayment(intent, 'confirmed', replayKey, dbConfig);
      if (!replaySaved.ok && !isDemoPaymentKey(parsed.paymentKey)) {
        return jsonError(500, replaySaved.errorCode, replaySaved.errorMessage, {
          supabaseError: replaySaved.supabaseError,
        });
      }
      if (!replaySaved.ok) {
        console.error('[SponsorAuction] demo 결제 저장 실패, 낙찰은 계속 진행', replaySaved);
      }
      await applyPaidAuctionStatus(intent.auctionId, intent.bidId, dbConfig);
      const replay: ConfirmPaymentResult = {
        orderId: intent.orderId,
        auctionId: intent.auctionId,
        bidId: intent.bidId,
        amount: intent.amount,
        paymentKey: replayKey,
        alreadyConfirmed: true,
        saved: replaySaved.ok,
      };
      return NextResponse.json(replay, { status: 200 });
    }

    if (existing?.status === 'failed' || existing?.status === 'expired') {
      console.error('[SponsorAuction] 결제 승인 실패: 이미 취소/만료', {
        orderId: parsed.orderId,
        status: existing.status,
      });
      return jsonError(
        409,
        'INTENT_NOT_PENDING',
        '이미 취소되었거나 만료된 결제입니다. 낙찰은 진행되지 않았습니다.',
      );
    }

    const demoAllowed = !isTossSecretConfigured() && isDemoPaymentKey(parsed.paymentKey);
    if (!demoAllowed) {
      if (!isTossSecretConfigured()) {
        updateIntent(intent.orderId, { status: 'failed', paymentKey: parsed.paymentKey });
        console.error('[SponsorAuction] 결제 승인 실패: TOSS_SECRET_KEY 없음', {
          orderId: parsed.orderId,
        });
        return jsonError(
          502,
          'TOSS_SECRET_KEY_MISSING',
          'TOSS_SECRET_KEY가 없어 결제를 승인할 수 없습니다. Vercel 서버 환경 변수에 시크릿 키를 등록해 주세요.',
        );
      }

      const toss = await confirmTossPayment(parsed);
      if (!toss.ok) {
        updateIntent(intent.orderId, { status: 'failed', paymentKey: parsed.paymentKey });
        await persistPayment(intent, 'failed', parsed.paymentKey, dbConfig);
        const errorCode = toss.errorCode || 'TOSS_CONFIRM_FAILED';
        const errorMessage =
          toss.errorMessage || toss.error || '결제 승인에 실패했습니다. 낙찰은 진행되지 않았습니다.';
        console.error('[SponsorAuction] Toss confirm API 거절', {
          orderId: parsed.orderId,
          amount: parsed.amount,
          errorCode,
          errorMessage,
        });
        return jsonError(402, errorCode, errorMessage, {
          httpStatus: toss.httpStatus,
        });
      }
    }

    const saved = await persistPayment(
      intent,
      'confirmed',
      parsed.paymentKey,
      dbConfig,
    );
    if (!saved.ok && !isDemoPaymentKey(parsed.paymentKey)) {
      return jsonError(500, saved.errorCode, saved.errorMessage, {
        supabaseError: saved.supabaseError,
      });
    }
    if (!saved.ok) {
      console.error('[SponsorAuction] demo 결제 저장 실패, 낙찰은 계속 진행', saved);
    }

    await applyPaidAuctionStatus(intent.auctionId, intent.bidId, dbConfig);

    updateIntent(intent.orderId, {
      status: 'confirmed',
      paymentKey: parsed.paymentKey,
    });

    const result: ConfirmPaymentResult = {
      orderId: intent.orderId,
      auctionId: intent.auctionId,
      bidId: intent.bidId,
      amount: intent.amount,
      paymentKey: parsed.paymentKey,
      alreadyConfirmed: false,
      saved: saved.ok,
    };

    console.info('[SponsorAuction] 결제 승인 완료', {
      orderId: result.orderId,
      auctionId: result.auctionId,
      bidId: result.bidId,
      amount: result.amount,
      demoAllowed,
      saved: result.saved,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[SponsorAuction] 결제 승인 중 예외가 발생했습니다.', error);
    const errorMessage =
      error instanceof Error ? error.message : '결제 승인에 실패했습니다. 낙찰은 진행되지 않았습니다.';
    return jsonError(500, 'CONFIRM_EXCEPTION', errorMessage);
  }
}
