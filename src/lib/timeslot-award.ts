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

const ORDER_NAME = '크리에이터 상품 크레딧 예치';

export type TimeslotSelectionResult =
  | { ok: true; data: TimeSlotItem }
  | { ok: false; status: number; error: string; errorCode: string };

export type TimeslotCreditPayResult =
  | { ok: true; data: TimeSlotItem; amount: number; orderId: string }
  | { ok: false; status: number; error: string; errorCode: string; neededAmount?: number };

function holdFailure(
  held: { code: string; message: string },
  neededAmount: number,
): TimeslotCreditPayResult {
  const status =
    held.code === 'INSUFFICIENT_CREDIT'
      ? 402
      : held.code === 'ALREADY_AWARDED'
        ? 409
        : held.code === 'FORBIDDEN'
          ? 403
          : held.code === 'NOT_AWARDED'
            ? 409
            : 400;
  return {
    ok: false,
    status,
    error: held.message,
    errorCode: held.code,
    neededAmount,
  };
}

export async function awardTimeslotSelection(
  client: SponsorAuctionClient | null,
  input: {
    slotId: string;
    bidId: string;
    actorUserId: string;
  },
): Promise<TimeslotSelectionResult> {
  const slotId = input.slotId.trim();
  const bidId = input.bidId.trim();
  if (!slotId || !bidId) {
    return {
      ok: false,
      status: 400,
      error: '상품 또는 제안 ID가 올바르지 않습니다.',
      errorCode: 'INVALID_AWARD',
    };
  }

  const slotResult = await getTimeSlotById(slotId, client);
  const slot = slotResult.data;
  if (!slot) {
    return {
      ok: false,
      status: 400,
      error: slotResult.error ?? '크리에이터 상품을 찾을 수 없습니다.',
      errorCode: 'AWARD_TARGET_NOT_FOUND',
    };
  }
  if (slot.winnerBidId && slot.winnerBidId !== bidId) {
    return {
      ok: false,
      status: 409,
      error: '이미 다른 제안이 채택된 상품입니다.',
      errorCode: 'ALREADY_AWARDED',
    };
  }
  if (slot.winnerBidId === bidId) {
    return { ok: true, data: slot };
  }

  const applied = await awardTimeSlotBid(slotId, bidId, input.actorUserId, client);
  if (applied.error || !applied.data) {
    return {
      ok: false,
      status: 400,
      error: applied.error ?? '크리에이터 상품 낙찰 상태를 저장하지 못했습니다.',
      errorCode: 'AWARD_FAILED',
    };
  }
  return { ok: true, data: applied.data };
}

export async function payTimeslotWithCredit(
  admin: SponsorAuctionClient,
  input: {
    slotId: string;
    bidId: string;
    actorUserId: string;
    actorIsAdmin?: boolean;
  },
): Promise<TimeslotCreditPayResult> {
  const slotId = input.slotId.trim();
  const bidId = input.bidId.trim();
  if (!isUuid(slotId) || !isUuid(bidId)) {
    return {
      ok: false,
      status: 400,
      error: '상품 또는 제안 ID가 올바르지 않습니다.',
      errorCode: 'INVALID_PAY',
    };
  }

  const slotResult = await getTimeSlotById(slotId, admin);
  const slot = slotResult.data;
  if (!slot) {
    return {
      ok: false,
      status: 400,
      error: slotResult.error ?? '크리에이터 상품을 찾을 수 없습니다.',
      errorCode: 'PAY_TARGET_NOT_FOUND',
    };
  }
  if (!slot.winnerBidId || slot.winnerBidId !== bidId) {
    return {
      ok: false,
      status: 409,
      error: '낙찰된 제안만 결제할 수 있습니다.',
      errorCode: 'NOT_AWARDED',
    };
  }

  const bids = await listTimeSlotBids(slotId, admin);
  const winner = bids.data.find((item) => item.id === bidId);
  if (!winner || winner.bidAmount <= 0) {
    return {
      ok: false,
      status: 400,
      error: '해당 제안을 찾을 수 없습니다.',
      errorCode: 'PAY_TARGET_NOT_FOUND',
    };
  }
  if (
    winner.advertiserId &&
    winner.advertiserId !== input.actorUserId &&
    !input.actorIsAdmin
  ) {
    return {
      ok: false,
      status: 403,
      error: '선정된 광고주만 결제할 수 있습니다.',
      errorCode: 'FORBIDDEN',
    };
  }

  const holdQuote = campaignHoldQuote(winner.bidAmount);
  if (slot.paidAt) {
    return { ok: true, data: slot, amount: holdQuote.amount, orderId: campaignAwardOrderId(slotId, bidId) };
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
      reason: '크리에이터 상품 결제 기록 저장 실패로 크레딧 복구',
    });
    return {
      ok: false,
      status: 500,
      error: saved.errorMessage,
      errorCode: saved.errorCode,
    };
  }

  await upsertPaidPayout(admin, {
    orderId,
    auctionId: slotId,
    bidId,
    chargeAmount: amount,
    orderName: slot.title,
  });

  return {
    ok: true,
    data: { ...slot, paidAt: new Date().toISOString() },
    amount,
    orderId,
  };
}
