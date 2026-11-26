import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { timeslotIdFromParam, timeslotWriter } from '@/lib/timeslot-http';
import { awardTimeslotSelection } from '@/lib/timeslot-award';
import { getTimeSlotById } from '@/lib/timeslots';
import { isUuid } from '@/lib/uuid';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await connection();
    } catch {
      // 낙찰은 계속합니다.
    }
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('낙찰하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'creator') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('상품 낙찰은 크리에이터만 할 수 있습니다.');
    }
    const { id } = await context.params;
    const slotId = timeslotIdFromParam(id);
    const writer = await timeslotWriter();
    const slot = await getTimeSlotById(slotId, writer);
    if (!slot.data) {
      return NextResponse.json(
        {
          error: slot.error ?? '크리에이터 상품을 찾을 수 없습니다.',
          errorMessage: slot.error ?? '크리에이터 상품을 찾을 수 없습니다.',
          errorCode: 'TIMESLOT_NOT_FOUND',
        },
        { status: 404, headers: NO_STORE },
      );
    }
    const ownerId = slot.data.creatorId;
    if (ownerId && isUuid(ownerId) && ownerId !== actor.userId && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('본인 상품만 낙찰할 수 있습니다.');
    }
    if (ownerId && actor.userId && ownerId !== actor.userId && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('본인 상품만 낙찰할 수 있습니다.');
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const bidId = asText(body?.bidId);
    const awarded = await awardTimeslotSelection(writer, {
      slotId: slot.data.id,
      bidId,
      actorUserId: actor.userId,
    });
    if (!awarded.ok) {
      return NextResponse.json(
        {
          error: awarded.error,
          errorMessage: awarded.error,
          errorCode: awarded.errorCode,
        },
        { status: awarded.status, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: awarded.data }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message =
      error instanceof Error ? error.message : '낙찰하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
