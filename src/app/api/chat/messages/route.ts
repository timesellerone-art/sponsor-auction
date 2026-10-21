import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { listChatMessages, sendChatMessage } from '@/lib/chat';
import { recordBypassIfNeeded } from '@/lib/compliance';
import { unauthorizedJson, getPaymentActor } from '@/lib/payments/guard';
import {
  OffPlatformContactError,
  assertNoOffPlatformContact,
  maskOffPlatformContact,
} from '@/utils/filter';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: Request) {
  try {
    try {
      await connection();
    } catch {
      // 동적 렌더 힌트가 실패해도 채팅 조회는 계속합니다.
    }

    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('채팅을 조회하려면 로그인해 주세요.');
    }

    const auctionId = asText(new URL(request.url).searchParams.get('auctionId'));
    const result = await listChatMessages(auctionId);
    if (result.error) {
      return NextResponse.json(
        { error: result.error, errorMessage: result.error },
        { status: 400, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        data: result.data.map((item) => ({
          ...item,
          body: maskOffPlatformContact(item.body),
        })),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '채팅 메시지를 불러오지 못했습니다.';
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
      // 동적 렌더 힌트가 실패해도 채팅 전송은 계속합니다.
    }

    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('채팅을 보내려면 로그인해 주세요.');
    }

    const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const body = asText(payload?.body);
    await recordBypassIfNeeded({
      text: body,
      source: 'chat',
      actorId: actor.userId,
      auctionId: asText(payload?.auctionId),
    });
    try {
      assertNoOffPlatformContact(body);
    } catch (error) {
      const message =
        error instanceof OffPlatformContactError
          ? error.message
          : '플랫폼 우회 연락처는 사용할 수 없습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message, errorCode: 'OFF_PLATFORM_CONTACT' },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await sendChatMessage({
      auctionId: asText(payload?.auctionId),
      senderId: (actor.userId ?? asText(payload?.senderId)) || null,
      senderName: asText(payload?.senderName) || '참여자',
      body,
    });

    if (result.error || !result.data) {
      const message = result.error ?? '메시지를 저장하지 못했습니다.';
      return NextResponse.json(
        { error: message, errorMessage: message },
        { status: 400, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      { data: { ...result.data, body: maskOffPlatformContact(result.data.body) } },
      { headers: NO_STORE },
    );
  } catch (error) {
    if (error instanceof OffPlatformContactError) {
      return NextResponse.json(
        {
          error: error.message,
          errorMessage: error.message,
          errorCode: 'OFF_PLATFORM_CONTACT',
        },
        { status: 400, headers: NO_STORE },
      );
    }
    const message =
      error instanceof Error ? error.message : '메시지를 저장하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
