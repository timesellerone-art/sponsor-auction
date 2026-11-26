import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { rethrowPrerenderError } from '@/lib/prerender-error';
import { listBidsFromDatabase } from '@/lib/auctions';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { timeSlotBidToBidItem } from '@/lib/timeslot-deal';
import { listTimeSlotBidsBySlotIds, listTimeSlots } from '@/lib/timeslots';

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
      return forbiddenJson('제안 목록은 관리자만 볼 수 있습니다.');
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        {
          error: 'SUPABASE_SERVICE_ROLE_KEY가 없어 제안 목록을 DB에서 읽을 수 없습니다.',
          errorMessage: 'SUPABASE_SERVICE_ROLE_KEY가 없어 제안 목록을 DB에서 읽을 수 없습니다.',
          fallbackMock: true,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const [bids, slotResult] = await Promise.all([
      listBidsFromDatabase(client),
      listTimeSlots({ client, includeHidden: true }),
    ]);
    const slots = Array.isArray(slotResult.data) ? slotResult.data : [];
    const slotBids = await listTimeSlotBidsBySlotIds(
      slots.map((item) => item.id),
      client,
    );
    const slotById = new Map(slots.map((item) => [item.id, item]));
    const mappedSlotBids = (Array.isArray(slotBids.data) ? slotBids.data : []).flatMap((bid) => {
      const slot = slotById.get(bid.timeSlotId);
      return slot ? [timeSlotBidToBidItem(bid, slot)] : [];
    });
    return NextResponse.json({ data: [...bids, ...mappedSlotBids] }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
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
