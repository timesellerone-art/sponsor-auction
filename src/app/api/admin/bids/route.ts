import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { listBidsFromDatabase } from '@/lib/auctions';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET() {
  try {
    await connection();
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('입찰을 조회하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('입찰 목록은 관리자만 볼 수 있습니다.');
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        {
          error: 'SUPABASE_SERVICE_ROLE_KEY가 없어 입찰 목록을 DB에서 읽을 수 없습니다.',
          errorMessage: 'SUPABASE_SERVICE_ROLE_KEY가 없어 입찰 목록을 DB에서 읽을 수 없습니다.',
          fallbackMock: true,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const bids = await listBidsFromDatabase(client);
    return NextResponse.json({ data: bids }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '알 수 없는 오류';
    console.error('[SponsorAuction] 관리자 입찰 목록 API 예외', error);
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
