import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { recordBypassIfNeeded } from '@/lib/compliance';
import { listTimeSlotBids, placeTimeSlotBid } from '@/lib/timeslots';
import { hasAuthRole } from '@/types/auth';
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
    const result = await listTimeSlotBids(id);
    if (result.error) {
      return NextResponse.json(
        { error: result.error, errorMessage: result.error },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '입찰 목록을 불러오지 못했습니다.';
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
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('입찰하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'advertiser') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('인벤토리 입찰은 광고주만 할 수 있습니다.');
    }
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const message = asText(body?.message);
    await recordBypassIfNeeded({
      text: message,
      source: 'timeslot_bid',
      actorId: actor.userId,
      auctionId: id,
    });
    try {
      assertNoOffPlatformContact(message);
    } catch (error) {
      const text =
        error instanceof OffPlatformContactError
          ? error.message
          : '플랫폼 우회 연락처는 사용할 수 없습니다.';
      return NextResponse.json(
        { error: text, errorMessage: text, errorCode: 'OFF_PLATFORM_CONTACT' },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await placeTimeSlotBid({
      timeSlotId: id,
      advertiserId: (actor.userId ?? asText(body?.advertiserId)) || null,
      advertiserName: asText(body?.advertiserName) || '광고주',
      bidAmount: asNumber(body?.bidAmount),
      message,
    });
    if (result.error || !result.data) {
      const text = result.error ?? '입찰을 등록하지 못했습니다.';
      return NextResponse.json(
        { error: text, errorMessage: text },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '입찰을 등록하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
