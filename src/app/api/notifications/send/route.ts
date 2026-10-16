import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  deliverLifecycleNotification,
  isLifecycleEvent,
  type LifecycleNotifyInput,
} from '@/lib/notification';
import { unauthorizedJson, getPaymentActor } from '@/lib/payments/guard';

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('알림을 보내려면 로그인해 주세요.');
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const event = asText(body?.event);
    if (!isLifecycleEvent(event)) {
      return NextResponse.json({ error: '지원하지 않는 알림 이벤트입니다.' }, { status: 400 });
    }

    const input: LifecycleNotifyInput = {
      event,
      to: asText(body?.to) || null,
      toName: asText(body?.toName) || null,
      toEmail: asText(body?.toEmail) || null,
      toUserId: asText(body?.toUserId) || null,
      auctionId: asText(body?.auctionId) || null,
      auctionTitle: asText(body?.auctionTitle) || null,
      extra: asText(body?.extra) || null,
    };

    const result = await deliverLifecycleNotification(input);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.info('[Notification Mock] send API 예외 수용', error);
    return NextResponse.json({
      data: { ok: true, mocked: true, event: 'bid_received', text: '' },
    });
  }
}
