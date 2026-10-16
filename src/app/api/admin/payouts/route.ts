import { revalidatePath, revalidateTag } from 'next/cache';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { listPayoutsFromDatabase, markPayoutPaid, type MarkPayoutPaidInput } from '@/lib/payouts';
import { issueTaxInvoice } from '@/lib/popbill';
import { createAdminClient } from '@/lib/supabase/admin';
import { bidAmountFromCreatorPayout } from '@/lib/fees';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseInput(value: unknown): MarkPayoutPaidInput | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const body = value as Record<string, unknown>;
  const id = asText(body.id);
  const paymentOrderId = asText(body.paymentOrderId) || asText(body.payment_order_id);
  const auctionId = asText(body.auctionId) || asText(body.auction_id);
  const bidId = asText(body.bidId) || asText(body.bid_id);
  if (!id && !paymentOrderId && !auctionId) {
    return null;
  }

  return {
    id,
    paymentOrderId: paymentOrderId || null,
    auctionId: auctionId || null,
    bidId: bidId || null,
    amount: typeof body.amount === 'number' ? body.amount : Number(body.amount) || undefined,
    auctionTitle: asText(body.auctionTitle) || asText(body.auction_title),
    creatorName: asText(body.creatorName) || asText(body.creator_name),
    creatorEmail: asText(body.creatorEmail) || asText(body.creator_email),
    creatorId: asText(body.creatorId) || asText(body.creator_id),
  };
}

export async function GET() {
  try {
    await connection();
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('정산을 조회하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('정산 목록은 관리자만 볼 수 있습니다.');
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        {
          error: 'SUPABASE_SERVICE_ROLE_KEY가 없어 정산 목록을 DB에서 읽을 수 없습니다.',
          errorMessage: 'SUPABASE_SERVICE_ROLE_KEY가 없어 정산 목록을 DB에서 읽을 수 없습니다.',
          fallbackMock: true,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const payouts = await listPayoutsFromDatabase(client);
    return NextResponse.json(
      { data: payouts },
      { headers: NO_STORE },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '알 수 없는 오류';
    console.error('[SponsorAuction] 관리자 정산 목록 API 예외', error);
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('정산을 처리하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('지급 처리는 관리자만 할 수 있습니다.');
    }

    const parsed = parseInput(await request.json().catch(() => null));
    if (!parsed) {
      return NextResponse.json(
        {
          error: '정산 ID 또는 결제/경매 정보가 필요합니다.',
          errorMessage: '정산 ID 또는 결제/경매 정보가 필요합니다.',
          fallbackMock: true,
        },
        { status: 409 },
      );
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        {
          error:
            'SUPABASE_SERVICE_ROLE_KEY가 없거나 service_role JWT가 아니라 정산을 DB에 저장할 수 없습니다.',
          errorMessage:
            'SUPABASE_SERVICE_ROLE_KEY가 없거나 service_role JWT가 아니라 정산을 DB에 저장할 수 없습니다.',
          fallbackMock: true,
        },
        { status: 409 },
      );
    }

    const result = await markPayoutPaid(client, parsed);
    if (!result.ok) {
      console.error('[SponsorAuction] 관리자 정산 DB 저장 실패', result.message);
      return NextResponse.json(
        {
          error: result.message,
          errorMessage: result.message,
        },
        { status: 500 },
      );
    }

    revalidatePath('/admin');
    revalidateTag('payouts', { expire: 0 });

    try {
      const bidAmount =
        result.data.bidAmount && result.data.bidAmount > 0
          ? result.data.bidAmount
          : bidAmountFromCreatorPayout(result.data.amount);
      const tax = await issueTaxInvoice({
        payoutId: result.data.id,
        paymentOrderId: result.data.paymentOrderId,
        auctionId: result.data.auctionId,
        bidId: result.data.bidId,
        bidAmount,
        buyerName: result.data.creatorName,
        buyerEmail: result.data.creatorEmail,
        itemName: result.data.auctionTitle,
      });
      console.info('[SponsorAuction] 정산 세금계산서 처리', tax);
    } catch (error) {
      console.warn('[SponsorAuction] 세금계산서 연동 우회', error);
    }

    return NextResponse.json(
      {
        data: result.data,
        status: result.data.status,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : '알 수 없는 오류';
    console.error('[SponsorAuction] 관리자 정산 API 예외', error);
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500 },
    );
  }
}
