import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { PAYMENT_INTENT_COOKIE, resolveIntent, updateIntent } from '@/lib/payments/intent';
import { canPreparePayment, forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { persistPayment } from '@/lib/payments/persist';
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
    const intent = resolveIntent(orderId, cookieStore.get(PAYMENT_INTENT_COOKIE)?.value);
    if (!intent) {
      return NextResponse.json({ ok: true });
    }

    if (intent.status === 'confirmed') {
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
    console.info('[SponsorAuction] 결제 intent 취소 처리', { orderId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[SponsorAuction] 결제 취소 처리 중 예외가 발생했습니다.', error);
    return NextResponse.json({ ok: true });
  }
}
