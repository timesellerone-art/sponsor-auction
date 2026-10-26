import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { closeTimeSlot, getTimeSlotById } from '@/lib/timeslots';
import { isUuid } from '@/lib/uuid';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await connection();
    } catch {
      // 조회는 계속합니다.
    }
    const { id } = await context.params;
    const result = await getTimeSlotById(id);
    if (result.error || !result.data) {
      const message = result.error ?? '타임슬롯을 찾을 수 없습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '타임슬롯을 불러오지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await connection();
    } catch {
      // 마감 처리는 계속합니다.
    }
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('타임슬롯을 마감하려면 로그인해 주세요.');
    }
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (body?.status !== 'closed') {
      return NextResponse.json(
        { error: '지원하지 않는 변경입니다.', errorMessage: '지원하지 않는 변경입니다.' },
        { status: 400, headers: NO_STORE },
      );
    }
    const current = await getTimeSlotById(id);
    const ownerId = current.data?.creatorId;
    if (ownerId && isUuid(ownerId) && ownerId !== actor.userId) {
      return forbiddenJson('본인 슬롯만 마감할 수 있습니다.');
    }
    if (ownerId && actor.userId && ownerId !== actor.userId) {
      return forbiddenJson('본인 슬롯만 마감할 수 있습니다.');
    }
    const result = await closeTimeSlot(id, actor.userId);
    if (result.error || !result.data) {
      const message = result.error ?? '타임슬롯을 마감하지 못했습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '타임슬롯을 마감하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
