import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { awardTimeSlotBid, getTimeSlotById } from '@/lib/timeslots';
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
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('낙찰하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'creator') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('타임슬롯 낙찰은 크리에이터만 할 수 있습니다.');
    }
    const { id } = await context.params;
    const slot = await getTimeSlotById(id);
    const ownerId = slot.data?.creatorId;
    if (ownerId && isUuid(ownerId) && ownerId !== actor.userId) {
      return forbiddenJson('본인 슬롯만 낙찰할 수 있습니다.');
    }
    if (ownerId && actor.userId && ownerId !== actor.userId) {
      return forbiddenJson('본인 슬롯만 낙찰할 수 있습니다.');
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const result = await awardTimeSlotBid(id, asText(body?.bidId), actor.userId);
    if (result.error || !result.data) {
      const message = result.error ?? '낙찰하지 못했습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '낙찰하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
