import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { recordBypassIfNeeded } from '@/lib/compliance';
import { timeslotIdFromParam, timeslotWriter } from '@/lib/timeslot-http';
import { getTimeSlotById, listTimeSlotBids, placeTimeSlotBid } from '@/lib/timeslots';
import { hasAuthRole } from '@/types/auth';
import { VALIDATION } from '@/lib/validation';
import { OffPlatformContactError, assertNoOffPlatformContact } from '@/utils/filter';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : NaN;
  }
  return NaN;
}

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
    const slotId = timeslotIdFromParam(id);
    const result = await listTimeSlotBids(slotId, await timeslotWriter());
    if (result.error) {
      return NextResponse.json(
        { error: result.error, errorMessage: result.error },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message =
      error instanceof Error ? error.message : '제안 목록을 불러오지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    try {
      await connection();
    } catch {
      // 입찰은 계속합니다.
    }
    const actor = await getPaymentActor(request);
    if (!actor) {
      return unauthorizedJson('제안하려면 로그인해 주세요.');
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
    if (slot.data.creatorId && actor.userId && slot.data.creatorId === actor.userId) {
      return forbiddenJson('본인 상품에는 제안할 수 없습니다.');
    }
    const actingAdvertiser =
      actor.activeRole !== 'creator' &&
      (hasAuthRole(actor, 'advertiser') || hasAuthRole(actor, 'admin'));
    if (!actingAdvertiser) {
      return forbiddenJson('크리에이터 상품 제안은 광고주 계정에서만 가능합니다.');
    }
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const message = asText(body?.message);
    await recordBypassIfNeeded({
      text: message,
      source: 'timeslot_bid',
      actorId: actor.userId,
      auctionId: slotId,
    });
    try {
      assertNoOffPlatformContact(message);
    } catch (error) {
      rethrowPrerenderError(error);
      const text =
        error instanceof OffPlatformContactError
          ? error.message
          : VALIDATION.offPlatformContact;
      return NextResponse.json(
        { error: text, errorMessage: text, errorCode: 'OFF_PLATFORM_CONTACT' },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await placeTimeSlotBid(
      {
        timeSlotId: slot.data.id,
        advertiserId: (actor.userId ?? asText(body?.advertiserId)) || null,
        advertiserName: asText(body?.advertiserName) || '광고주',
        bidAmount:
          Number.isFinite(slot.data.startingPrice) && slot.data.startingPrice > 0
            ? slot.data.startingPrice
            : asNumber(body?.bidAmount),
        message,
      },
      writer,
    );
    if (result.error || !result.data) {
      const text = result.error ?? '제안을 등록하지 못했습니다.';
      const duplicate = text === VALIDATION.duplicateTimeslotBid;
      return NextResponse.json(
        {
          error: text,
          errorMessage: text,
          ...(duplicate ? { errorCode: 'DUPLICATE_BID' } : {}),
        },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    const message =
      error instanceof Error ? error.message : '제안을 등록하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
