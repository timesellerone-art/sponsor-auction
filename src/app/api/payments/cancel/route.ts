import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { PAYMENT_INTENT_COOKIE, resolveIntent, updateIntent } from '@/lib/payments/intent';
import { persistPayment } from '@/lib/payments/persist';

const CANCEL_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const CANCEL_SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const CANCEL_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { orderId?: string } | null;
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
    const saved = await persistPayment(intent, 'failed', intent.paymentKey, {
      url: CANCEL_SUPABASE_URL,
      serviceKey: CANCEL_SUPABASE_SERVICE_KEY,
      anonKey: CANCEL_SUPABASE_ANON_KEY,
    });
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
