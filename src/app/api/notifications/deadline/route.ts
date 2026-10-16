import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { notifyUpcomingDeadlines } from '@/lib/notification-deadline';

export async function GET(request: Request) {
  try {
    await connection();
    const secret = (process.env.CRON_SECRET || '').trim();
    if (secret) {
      const auth = request.headers.get('authorization') || '';
      if (auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
      }
    }
    const result = await notifyUpcomingDeadlines();
    return NextResponse.json({ data: result });
  } catch (error) {
    console.info('[Notification Mock] 마감 임박 알림 예외 수용', error);
    return NextResponse.json({ data: { scanned: 0, sent: 0, mocked: true } });
  }
}

export const POST = GET;
