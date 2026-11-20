import { rethrowPrerenderError } from '@/lib/prerender-error';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { releaseCampaignPaymentIfOpen } from '@/lib/campaign-credit';
import { PAYMENT_INTENT_COOKIE, resolveIntent, updateIntent } from '@/lib/payments/intent';
import { canPreparePayment, forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { loadPaymentByOrderId, persistPayment } from '@/lib/payments/persist';
import { isUuid } from '@/lib/uuid';
import { hasAuthRole } from '@/types/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { paymentDbConfigForRequest } from '@/lib/supabase/payment-config';


export async function POST(request: Request) {
  try {
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('결제를 취소하려면 로그인해 주세요.');
    }
    if (!canPreparePayment(actor)) {
      return forbiddenJson('결제 취소는 광고주 계정만 할 수 있습니다.');
    }

    const body = (await request.json().catch(() => null)) as {
      orderId?: string;
      supabaseUrl?: string;
      supabaseAnonKey?: string;
    } | null;
    const orderId = body?.orderId?.trim() ?? '';
    if (!orderId) {
      return NextResponse.json({ error: '주문번호가 필요합니다.' }, { status: 400 });
    }

    const cookieStore = await cookies();
    let intent = resolveIntent(orderId, cookieStore.get(PAYMENT_INTENT_COOKIE)?.value);
    const admin = createAdminClient();
    if (!intent && admin) {
      const stored = await loadPaymentByOrderId(orderId);
      if (stored) {
        intent = {
          orderId: stored.orderId,
          auctionId: stored.auctionId,
          bidId: stored.bidId,
          amount: stored.amount,
          orderName: stored.orderName,
          status: stored.status,
          paymentKey: stored.paymentKey,
          createdAt: Date.now(),
        };
      }
    }
    if (!intent) {
      return NextResponse.json({ ok: true });
    }

    if (admin && actor.userId && !hasAuthRole(actor, 'admin') && isUuid(intent.auctionId)) {
      const auction = await admin
        .from('auctions')
        .select('author_id')
        .eq('id', intent.auctionId)
        .maybeSingle();
      const authorId = auction.data?.author_id ?? null;
      if (authorId && authorId !== actor.userId) {
        return forbiddenJson('본인 캠페인 결제만 취소할 수 있습니다.');
      }
    }

    if (intent.status === 'confirmed') {
      if (admin) {
        const released = await releaseCampaignPaymentIfOpen(admin, {
          orderId,
          auctionId: intent.auctionId,
          bidId: intent.bidId,
          reason: '승인 이후 채택이 끝나지 않아 크레딧 복구',
        });
        if (released.ok && released.restored) {
          return NextResponse.json({ ok: true, creditRestored: true, amount: released.amount });
        }
      }
      return NextResponse.json(
        { error: '이미 승인된 결제는 이 경로에서 취소할 수 없습니다.' },
        { status: 409 },
      );
    }

    updateIntent(orderId, { status: 'failed' });
    const dbConfig = await paymentDbConfigForRequest({
      supabaseUrl: body?.supabaseUrl,
      supabaseAnonKey: body?.supabaseAnonKey,
    });
    const saved = await persistPayment(intent, 'failed', intent.paymentKey, dbConfig);
    if (!saved.ok) {
      console.error('[SponsorAuction] 결제 취소 DB 반영 실패', saved);
    }
    let creditRestored = false;
    let restoredAmount = 0;
    if (admin) {
      const released = await releaseCampaignPaymentIfOpen(admin, {
        orderId,
        auctionId: intent.auctionId,
        bidId: intent.bidId,
        reason: '결제 취소로 캠페인 크레딧 복구',
      });
      if (!released.ok) {
        console.error('[SponsorAuction] 결제 취소 크레딧 복구 실패', {
          orderId,
          code: released.code,
        });
      } else {
        creditRestored = released.restored;
        restoredAmount = released.amount;
      }
    }
    console.info('[SponsorAuction] 결제 intent 취소 처리', { orderId, creditRestored, restoredAmount });
    return NextResponse.json({ ok: true, creditRestored, amount: restoredAmount });
  } catch (error) {
    rethrowPrerenderError(error);
    console.error('[SponsorAuction] 결제 취소 처리 중 예외가 발생했습니다.', error);
    return NextResponse.json({ ok: true });
  }
}
