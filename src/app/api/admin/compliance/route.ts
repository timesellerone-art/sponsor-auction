import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { listComplianceLogs } from '@/lib/compliance';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET() {
  try {
    try {
      await connection();
    } catch {
      // 조회는 계속합니다.
    }
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('모니터링 로그를 보려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('우회 모니터링 로그는 관리자만 볼 수 있습니다.');
    }

    const data = await listComplianceLogs();
    return NextResponse.json({ data }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '모니터링 로그를 불러오지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
