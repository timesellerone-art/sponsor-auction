import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { rethrowPrerenderError } from '@/lib/prerender-error';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { listTimeSlots } from '@/lib/timeslots';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET() {
  try {
    await connection();
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('크리에이터 상품을 조회하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('크리에이터 상품 목록은 관리자만 볼 수 있습니다.');
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        {
          error: 'SUPABASE_SERVICE_ROLE_KEY가 없어 크리에이터 상품 목록을 DB에서 읽을 수 없습니다.',
          errorMessage: 'SUPABASE_SERVICE_ROLE_KEY가 없어 크리에이터 상품 목록을 DB에서 읽을 수 없습니다.',
          fallbackMock: true,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const result = await listTimeSlots({ client, includeHidden: true });
    if (result.error) {
      return NextResponse.json(
        { error: result.error, errorMessage: result.error, data: result.data },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message =
      error instanceof Error ? error.message : '크리에이터 상품 목록을 불러오지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
