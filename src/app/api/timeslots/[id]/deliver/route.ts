import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { timeslotIdFromParam, timeslotWriter } from '@/lib/timeslot-http';
import { deliverTimeSlot, getTimeSlotById } from '@/lib/timeslots';
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
      // 납품은 계속합니다.
    }
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('납품하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'creator') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('결과물 납품은 크리에이터만 할 수 있습니다.');
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
      return forbiddenJson('본인 상품만 납품할 수 있습니다.');
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await deliverTimeSlot(
      slot.data.id,
      asText(body?.deliveryUrl ?? body?.url),
      actor.userId,
      writer,
    );
    if (result.error || !result.data) {
      const message = result.error ?? '납품하지 못했습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '납품하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
