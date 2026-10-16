import { revalidatePath, revalidateTag } from 'next/cache';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { updatePayoutMemo } from '@/lib/payouts';
import { createAdminClient } from '@/lib/supabase/admin';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('메모를 저장하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('정산 메모는 관리자만 저장할 수 있습니다.');
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const id = asText(body?.id);
    const paymentOrderId = asText(body?.paymentOrderId) || asText(body?.payment_order_id);
    const auctionId = asText(body?.auctionId) || asText(body?.auction_id);
    const bidId = asText(body?.bidId) || asText(body?.bid_id);
    const adminMemo = typeof body?.adminMemo === 'string' ? body.adminMemo : asText(body?.admin_memo);
    if (!id && !paymentOrderId && !auctionId) {
      return NextResponse.json(
        {
          error: '정산 ID가 필요합니다.',
          errorMessage: '정산 ID가 필요합니다.',
          fallbackMock: true,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        {
          error: 'SUPABASE_SERVICE_ROLE_KEY가 없어 메모를 DB에 저장할 수 없습니다.',
          errorMessage: 'SUPABASE_SERVICE_ROLE_KEY가 없어 메모를 DB에 저장할 수 없습니다.',
          fallbackMock: true,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const result = await updatePayoutMemo(client, {
      id,
      paymentOrderId: paymentOrderId || null,
      auctionId: auctionId || null,
      bidId: bidId || null,
      adminMemo,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.message, errorMessage: result.message, fallbackMock: true },
        { status: 409, headers: NO_STORE },
      );
    }

    revalidatePath('/admin');
    revalidateTag('payouts', { expire: 0 });
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '알 수 없는 오류';
    console.error('[SponsorAuction] 관리자 정산 메모 API 예외', error);
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
