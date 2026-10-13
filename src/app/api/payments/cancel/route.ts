import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { PAYMENT_INTENT_COOKIE, resolveIntent, updateIntent } from '@/lib/payments/intent';

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
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.warn('[SponsorAuction] 결제 취소 처리 중 예외가 발생했습니다.', error);
    return NextResponse.json({ ok: true });
  }
}
