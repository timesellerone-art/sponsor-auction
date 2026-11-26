import {
  campaignAwardOrderId,
  campaignHoldQuote,
  holdCampaignPayment,
  releaseCampaignPaymentIfOpen,
} from '@/lib/campaign-credit';
import { persistPayment } from '@/lib/payments/persist';
import { upsertPaidPayout } from '@/lib/payouts';
import type { SponsorAuctionClient } from '@/lib/supabase';
import { awardTimeSlotBid, getTimeSlotById, listTimeSlotBids } from '@/lib/timeslots';
import { isUuid } from '@/lib/uuid';
import type { TimeSlotItem } from '@/types/timeslot';

const ORDER_NAME = '크리에이터 상품 크레딧 예치 낙찰';

export type TimeslotCreditAwardResult =
  | { ok: true; data: TimeSlotItem; amount: number; orderId: string }
  | { ok: false; status: number; error: string; errorCode: string; neededAmount?: number };

function holdFailure(
  held: { code: string; message: string },
  neededAmount: number,
): TimeslotCreditAwardResult {
  const status =
    held.code === 'INSUFFICIENT_CREDIT'
      ? 402
      : held.code === 'ALREADY_AWARDED'
        ? 409
        : held.code === 'FORBIDDEN'
          ? 403
          : 400;
  return {
    ok: false,
    status,
    error: held.message,
    errorCode: held.code,
    neededAmount,
  };
}

export async function awardTimeslotWithCredit(
  admin: SponsorAuctionClient,
  input: {
    slotId: string;
    bidId: string;
    actorUserId: string;
    actorIsAdmin?: boolean;
  },
): Promise<TimeslotCreditAwardResult> {
  const slotId = input.slotId.trim();
  const bidId = input.bidId.trim();
  if (!isUuid(slotId) || !isUuid(bidId)) {
    return {
      ok: false,
      status: 400,
      error: '상품 또는 제안 ID가 올바르지 않습니다.',
      errorCode: 'INVALID_AWARD',
    };
  }

  const slotResult = await getTimeSlotById(slotId, admin);
  const slot = slotResult.data;
  if (!slot) {
    return {
      ok: false,
      status: 400,
      error: slotResult.error ?? '크리에이터 상품을 찾을 수 없습니다.',
      errorCode: 'AWARD_TARGET_NOT_FOUND',
    };
  }

  const bids = await listTimeSlotBids(slotId, admin);
  const winner = bids.data.find((item) => item.id === bidId);
  if (!winner || winner.bidAmount <= 0) {
    return {
      ok: false,
      status: 400,
      error: '해당 제안을 찾을 수 없습니다.',
      errorCode: 'AWARD_TARGET_NOT_FOUND',
    };
  }

  const holdQuote = campaignHoldQuote(winner.bidAmount);
  if (slot.winnerBidId && slot.winnerBidId !== bidId) {
    return {
      ok: false,
      status: 409,
      error: '이미 다른 제안이 채택된 상품입니다.',
      errorCode: 'ALREADY_AWARDED',
      neededAmount: holdQuote.amount,
    };
  }

  const orderId = campaignAwardOrderId(slotId, bidId);
  const held = await holdCampaignPayment(admin, {
    orderId,
    auctionId: slotId,
    bidId,
    actorUserId: input.actorUserId,
    actorIsAdmin: Boolean(input.actorIsAdmin),
  });
  if (!held.ok) {
    return holdFailure(held, holdQuote.amount);
  }

  const amount = held.amount || holdQuote.amount;
  const saved = await persistPayment(
    {
      orderId,
      auctionId: slotId,
      bidId,
      amount,
      orderName: ORDER_NAME,
    },
    'confirmed',
    `credit:${orderId}`,
    undefined,
    admin,
  );
  if (!saved.ok) {
    await releaseCampaignPaymentIfOpen(admin, {
      orderId,
      auctionId: slotId,
      bidId,
      reason: '결제 기록 저장 실패로 크레딧 복구',
    });
    return {
      ok: false,
      status: 500,
      error: saved.errorMessage,
      errorCode: saved.errorCode,
    };
  }

  let awarded = slot;
  if (slot.winnerBidId !== bidId) {
    const applied = await awardTimeSlotBid(slotId, bidId, input.actorUserId, admin);
    if (applied.error || !applied.data) {
      return {
        ok: false,
        status: 500,
        error: '크리에이터 상품 낙찰 상태를 저장하지 못했습니다. 예치는 유지됩니다.',
        errorCode: 'AWARD_FAILED',
      };
    }
    awarded = applied.data;
  }

  await Promise.all(
    bids.data
      .filter((item) => item.id !== bidId)
      .map((item) =>
        releaseCampaignPaymentIfOpen(admin, {
          orderId: campaignAwardOrderId(slotId, item.id),
          auctionId: slotId,
          bidId: item.id,
          reason: '미선정 제안 크레딧 복구',
        }),
      ),
  );

  await upsertPaidPayout(admin, {
    orderId,
    auctionId: slotId,
    bidId,
    chargeAmount: amount,
    orderName: slot.title,
  });

  return { ok: true, data: awarded, amount, orderId };
}
