import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { deliverRealtimeWebhook, parseWebhookBody } from '@/lib/realtime-webhook';
import { verifyWebhookSecret } from '@/lib/webhook-auth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 웹훅은 동적 렌더 힌트와 무관하게 처리합니다.
    }

    const auth = verifyWebhookSecret(request);
    if (!auth.ok) {
      return NextResponse.json(
        { error: '웹훅 인증에 실패했습니다.', errorMessage: '웹훅 인증에 실패했습니다.' },
        { status: 401, headers: NO_STORE },
      );
    }

    const body = await request.json().catch(() => null);
    const change = parseWebhookBody(body);
    if (!change) {
      return NextResponse.json(
        { error: '지원하지 않는 웹훅 본문입니다.', errorMessage: '지원하지 않는 웹훅 본문입니다.' },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await deliverRealtimeWebhook(change);
    return NextResponse.json(
      { data: { ...result, table: change.table, eventType: change.eventType } },
      { headers: NO_STORE },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : '웹훅을 처리하지 못했습니다.';
    console.warn('[SponsorAuction] Realtime 웹훅 예외를 수용합니다.', error);
    return NextResponse.json(
      { data: { ok: true, mocked: true, errorMessage: message } },
      { headers: NO_STORE },
    );
  }
}
