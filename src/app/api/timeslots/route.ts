import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { isPlatformType } from '@/lib/platforms';
import { createTimeSlot, listTimeSlots } from '@/lib/timeslots';
import { hasAuthRole } from '@/types/auth';
import type { PlatformType } from '@/types/auction';

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

export async function GET(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 목록 조회는 계속합니다.
    }
    const mine = new URL(request.url).searchParams.get('mine') === '1';
    const actor = mine ? await getPaymentActor() : null;
    if (mine && !actor) {
      return unauthorizedJson('내 타임슬롯을 보려면 로그인해 주세요.');
    }
    const result = await listTimeSlots({
      creatorId: mine ? actor?.userId : undefined,
    });
    if (result.error) {
      return NextResponse.json(
        { error: result.error, errorMessage: result.error },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '타임슬롯 목록을 불러오지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 등록은 계속합니다.
    }
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('타임슬롯을 등록하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'creator') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('타임슬롯 등록은 크리에이터만 할 수 있습니다.');
    }

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const platformRaw = asText(body?.platform);
    const platform: PlatformType = isPlatformType(platformRaw) ? platformRaw : 'other';
    const result = await createTimeSlot({
      creatorId: (actor.userId ?? asText(body?.creatorId)) || null,
      creatorName: asText(body?.creatorName) || '크리에이터',
      title: asText(body?.title),
      platform,
      description: asText(body?.description),
      expectedViews: asNumber(body?.expectedViews),
      startingPrice: asNumber(body?.startingPrice),
      slotStart: asText(body?.slotStart),
      slotEnd: asText(body?.slotEnd),
      deadline: asText(body?.deadline),
    });
    if (result.error || !result.data) {
      const message = result.error ?? '타임슬롯을 등록하지 못했습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message },
        { status: 400, headers: NO_STORE },
      );
    }
    return NextResponse.json({ data: result.data }, { headers: NO_STORE });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '타임슬롯을 등록하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
