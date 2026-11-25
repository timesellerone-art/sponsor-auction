import { describeSettlementAmounts } from '@/lib/settlement-amounts';
import {
  deductUserCredit,
  restoreUserCredit,
  type CreditLedgerClient,
} from '@/lib/credits';
import { isUuid } from '@/lib/uuid';

export type CreditLedgerSnap = {
  user_id: string;
  type: 'CHARGE' | 'HOLD' | 'RELEASE' | 'REFUND';
  amount: number;
  reference_id: string | null;
  description?: string | null;
};

export type CampaignHoldResult =
  | {
      ok: true;
      skipped: boolean;
      alreadyHeld: boolean;
      amount: number;
      balanceAfter: number | null;
      referenceId: string | null;
      payerUserId: string | null;
    }
  | { ok: false; code: string; message: string };

export type CampaignReleaseResult =
  | {
      ok: true;
      restored: boolean;
      amount: number;
      balanceAfter: number | null;
      reason: 'missing' | 'already_released' | 'awarded' | 'released';
    }
  | { ok: false; code: string; message: string };

export function campaignPayReference(orderId: string) {
  const id = orderId.trim();
  if (!id) {
    return '';
  }
  return `campaign-pay:${id}`;
}

export function campaignAwardOrderId(auctionId: string, bidId: string) {
  return `ord_awd_${auctionId.replace(/-/g, '')}_${bidId.replace(/-/g, '')}`;
}

export function timeslotAwardReference(slotId: string, bidId: string, attemptId: string) {
  return `timeslot-award:${slotId.trim()}:${bidId.trim()}:${attemptId.trim()}`;
}

export function campaignHoldQuote(bidAmount: number) {
  const amounts = describeSettlementAmounts(bidAmount);
  return {
    bid: amounts.bidAmount,
    fee: amounts.advertiserFee,
    supply: amounts.advertiserSupply,
    vat: amounts.advertiserVat,
    amount: amounts.advertiserCharge,
  };
}

function formatHoldBreakdown(
  quote: ReturnType<typeof campaignHoldQuote>,
  options?: { locale?: boolean },
) {
  const won = (value: number) =>
    options?.locale ? value.toLocaleString('ko-KR') : String(value);
  return `공급가액 ${won(quote.supply)}원(낙찰 ${won(quote.bid)}+수수료 ${won(quote.fee)}) · 부가세 ${won(quote.vat)}원 · 총 ${won(quote.amount)}원`;
}

export function campaignHoldDescription(input: { title?: string | null; bidAmount: number }) {
  const quote = campaignHoldQuote(input.bidAmount);
  const title = input.title?.trim() || '캠페인';
  return `${title} 채택: ${formatHoldBreakdown(quote)}`;
}

export function parseCampaignHoldBidAmount(description?: string | null) {
  const fromText = description ?? '';
  const bidMatch = fromText.match(/낙찰\s*([0-9,]+)/);
  const proposalMatch = fromText.match(/제안\s*([0-9,]+)원/);
  const raw = bidMatch?.[1] ?? proposalMatch?.[1];
  if (!raw) {
    return null;
  }
  const bid = Number(raw.replace(/,/g, ''));
  return Number.isFinite(bid) && bid > 0 ? bid : null;
}

export function campaignHoldLedgerLabel(input: {
  type: 'HOLD' | 'RELEASE' | 'CHARGE' | 'REFUND';
  amount: number;
  description?: string | null;
}) {
  if (input.type !== 'HOLD' && input.type !== 'RELEASE') {
    return input.description?.trim() || '';
  }
  const prefix = input.type === 'HOLD' ? '예치' : '예치 해제';
  const bid = parseCampaignHoldBidAmount(input.description);
  if (bid != null) {
    const quote = campaignHoldQuote(bid);
    return `${prefix}: ${formatHoldBreakdown(quote, { locale: true })}`;
  }
  const fromText = input.description?.trim() || '';
  if (fromText && !/부가세\s*(?:10%\s*)?0원/.test(fromText)) {
    return fromText;
  }
  return `${prefix}: 총 ${Math.round(input.amount).toLocaleString('ko-KR')}원`;
}

export function holdRestorePlan(rows: CreditLedgerSnap[], referenceId: string) {
  const matched = rows.filter((row) => row.reference_id === referenceId);
  const hold = matched.find((row) => row.type === 'HOLD');
  const restored = matched.find((row) => row.type === 'RELEASE' || row.type === 'REFUND');
  if (!hold) {
    return { action: 'skip' as const, reason: 'missing' as const };
  }
  if (restored) {
    return { action: 'skip' as const, reason: 'already_released' as const };
  }
  return {
    action: 'release' as const,
    userId: hold.user_id,
    amount: hold.amount,
  };
}

async function loadReferenceRows(client: CreditLedgerClient, referenceId: string) {
  const { data, error } = await client
    .from('credit_transactions')
    .select('user_id, type, amount, reference_id, description')
    .eq('reference_id', referenceId);
  if (error) {
    return { rows: [] as CreditLedgerSnap[], error: error.message };
  }
  return { rows: (data ?? []) as CreditLedgerSnap[], error: null };
}

export async function holdCampaignCredit(
  client: CreditLedgerClient,
  input: {
    userId: string;
    referenceId: string;
    bidAmount: number;
    title?: string | null;
  },
): Promise<CampaignHoldResult> {
  const userId = input.userId.trim();
  const referenceId = input.referenceId.trim();
  const quote = campaignHoldQuote(input.bidAmount);
  if (!userId || !referenceId || quote.amount <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT', message: '차감할 캠페인 금액이 올바르지 않습니다.' };
  }

  const existing = await loadReferenceRows(client, referenceId);
  if (existing.error) {
    return { ok: false, code: 'RPC_ERROR', message: existing.error };
  }
  const existingPlan = holdRestorePlan(existing.rows, referenceId);
  if (existingPlan.action === 'release') {
    if (existingPlan.userId === userId && existingPlan.amount === quote.amount) {
      return {
        ok: true,
        skipped: false,
        alreadyHeld: true,
        amount: quote.amount,
        balanceAfter: null,
        referenceId,
        payerUserId: userId,
      };
    }
    return {
      ok: false,
      code: 'DUPLICATE_REFERENCE',
      message: '이미 처리된 캠페인 차감입니다. 채택은 다시 진행되지 않았습니다.',
    };
  }
  if (existingPlan.reason === 'already_released') {
    return {
      ok: false,
      code: 'DUPLICATE_REFERENCE',
      message: '이미 취소된 캠페인 차감입니다. 채택은 다시 진행되지 않았습니다.',
    };
  }

  const held = await deductUserCredit(client, {
    userId,
    amount: quote.amount,
    type: 'HOLD',
    referenceId,
    description: campaignHoldDescription({ title: input.title, bidAmount: quote.bid }),
  });
  if (held.ok) {
    console.info('[SponsorAuction] 캠페인 크레딧 차감', {
      referenceId,
      amount: quote.amount,
      fee: quote.fee,
      vat: quote.vat,
      balanceAfter: held.data.balance_after,
    });
    return {
      ok: true,
      skipped: false,
      alreadyHeld: false,
      amount: quote.amount,
      balanceAfter: held.data.balance_after,
      referenceId,
      payerUserId: userId,
    };
  }

  if (held.error.code === 'INSUFFICIENT_CREDIT') {
    return {
      ok: false,
      code: held.error.code,
      message: `크레딧이 부족해 채택할 수 없습니다. 총액 ${quote.amount.toLocaleString('ko-KR')}원(공급가액 ${quote.supply.toLocaleString('ko-KR')}원 + 부가세 ${quote.vat.toLocaleString('ko-KR')}원)이 필요합니다.`,
    };
  }
  if (held.error.code === 'DUPLICATE_REFERENCE') {
    const raced = await loadReferenceRows(client, referenceId);
    const racedPlan = holdRestorePlan(raced.rows, referenceId);
    if (racedPlan.action === 'release' && racedPlan.userId === userId && racedPlan.amount === quote.amount) {
      return {
        ok: true,
        skipped: false,
        alreadyHeld: true,
        amount: quote.amount,
        balanceAfter: null,
        referenceId,
        payerUserId: userId,
      };
    }
  }
  console.error('[SponsorAuction] 캠페인 크레딧 차감 실패', {
    referenceId,
    amount: quote.amount,
    code: held.error.code,
  });
  return { ok: false, code: held.error.code, message: held.error.message };
}

export async function releaseCampaignCredit(
  client: CreditLedgerClient,
  input: { referenceId: string; reason: string },
): Promise<CampaignReleaseResult> {
  const referenceId = input.referenceId.trim();
  if (!referenceId) {
    return { ok: false, code: 'INVALID_AMOUNT', message: '복구할 참조 키가 없습니다.' };
  }

  const existing = await loadReferenceRows(client, referenceId);
  if (existing.error) {
    return { ok: false, code: 'RPC_ERROR', message: existing.error };
  }
  const plan = holdRestorePlan(existing.rows, referenceId);
  if (plan.action === 'skip') {
    return { ok: true, restored: false, amount: 0, balanceAfter: null, reason: plan.reason };
  }

  const holdRow = existing.rows.find((row) => row.type === 'HOLD');
  const restored = await restoreUserCredit(client, {
    userId: plan.userId,
    amount: plan.amount,
    type: 'RELEASE',
    referenceId,
    description: `${input.reason} · ${campaignHoldLedgerLabel({
      type: 'RELEASE',
      amount: plan.amount,
      description: holdRow?.description,
    })}`,
  });
  if (!restored.ok) {
    if (restored.error.code === 'DUPLICATE_REFERENCE') {
      return {
        ok: true,
        restored: false,
        amount: plan.amount,
        balanceAfter: null,
        reason: 'already_released',
      };
    }
    console.error('[SponsorAuction] 캠페인 크레딧 복구 실패', {
      referenceId,
      amount: plan.amount,
      code: restored.error.code,
    });
    return { ok: false, code: restored.error.code, message: restored.error.message };
  }

  console.info('[SponsorAuction] 캠페인 크레딧 복구', {
    referenceId,
    amount: plan.amount,
    balanceAfter: restored.data.balance_after,
  });
  return {
    ok: true,
    restored: true,
    amount: plan.amount,
    balanceAfter: restored.data.balance_after,
    reason: 'released',
  };
}

async function releaseOtherPendingHolds(
  client: CreditLedgerClient,
  auctionId: string,
  bidId: string,
  exceptOrderId: string,
) {
  const { data, error } = await client
    .from('payments')
    .select('order_id, status')
    .eq('auction_id', auctionId)
    .eq('bid_id', bidId);
  if (error || !data) {
    return;
  }
  for (const row of data) {
    if (!row.order_id || row.order_id === exceptOrderId || row.status === 'confirmed') {
      continue;
    }
    await releaseCampaignCredit(client, {
      referenceId: campaignPayReference(row.order_id),
      reason: '새 채택 결제로 이전 결제 대기를 해제',
    });
  }
}

export async function holdCampaignPayment(
  client: CreditLedgerClient,
  input: {
    orderId: string;
    auctionId: string;
    bidId: string;
    actorUserId?: string | null;
    actorIsAdmin?: boolean;
  },
): Promise<CampaignHoldResult> {
  const orderId = input.orderId.trim();
  const auctionId = input.auctionId.trim();
  const bidId = input.bidId.trim();
  if (!orderId || !auctionId || !bidId) {
    return { ok: false, code: 'INVALID_AMOUNT', message: '캠페인 결제 정보가 없습니다.' };
  }
  if (!isUuid(auctionId) || !isUuid(bidId)) {
    return {
      ok: true,
      skipped: true,
      alreadyHeld: false,
      amount: 0,
      balanceAfter: null,
      referenceId: null,
      payerUserId: null,
    };
  }

  const [auctionResult, bidResult] = await Promise.all([
    client.from('auctions').select('author_id, title, winner_bid_id').eq('id', auctionId).maybeSingle(),
    client.from('bids').select('bid_amount').eq('id', bidId).eq('auction_id', auctionId).maybeSingle(),
  ]);
  if (auctionResult.error || bidResult.error) {
    return {
      ok: false,
      code: 'RPC_ERROR',
      message: auctionResult.error?.message || bidResult.error?.message || '캠페인 금액을 확인하지 못했습니다.',
    };
  }
  const winnerId = auctionResult.data?.winner_bid_id ?? null;
  if (winnerId && winnerId !== bidId) {
    return { ok: false, code: 'ALREADY_AWARDED', message: '이미 다른 제안이 채택된 캠페인입니다.' };
  }
  const payerUserId = auctionResult.data?.author_id?.trim() ?? '';
  const bidAmount = bidResult.data?.bid_amount ?? 0;
  if (!payerUserId || bidAmount <= 0) {
    return { ok: false, code: 'AWARD_TARGET_NOT_FOUND', message: '채택할 제안 또는 광고주를 찾지 못했습니다.' };
  }
  const actorUserId = input.actorUserId?.trim() ?? '';
  if (actorUserId && actorUserId !== payerUserId && !input.actorIsAdmin) {
    return { ok: false, code: 'FORBIDDEN', message: '본인 캠페인만 채택할 수 있습니다.' };
  }

  await releaseOtherPendingHolds(client, auctionId, bidId, orderId);
  return holdCampaignCredit(client, {
    userId: payerUserId,
    referenceId: campaignPayReference(orderId),
    bidAmount,
    title: auctionResult.data?.title,
  });
}

export async function releaseCampaignPaymentIfOpen(
  client: CreditLedgerClient,
  input: { orderId: string; auctionId: string; bidId: string; reason: string },
): Promise<CampaignReleaseResult> {
  const auctionId = input.auctionId.trim();
  const bidId = input.bidId.trim();
  const orderId = input.orderId.trim();
  if (orderId) {
    const payment = await client
      .from('payments')
      .select('status')
      .eq('order_id', orderId)
      .maybeSingle();
    if (payment.data?.status === 'confirmed') {
      return { ok: true, restored: false, amount: 0, balanceAfter: null, reason: 'awarded' };
    }
  }
  if (isUuid(auctionId)) {
    const auction = await client
      .from('auctions')
      .select('status, winner_bid_id')
      .eq('id', auctionId)
      .maybeSingle();
    if (auction.error) {
      return { ok: false, code: 'RPC_ERROR', message: auction.error.message };
    }
    const status = auction.data?.status;
    const winnerId = auction.data?.winner_bid_id ?? null;
    if (
      winnerId === bidId &&
      (status === 'completed' || status === 'closed' || status === 'matched')
    ) {
      return { ok: true, restored: false, amount: 0, balanceAfter: null, reason: 'awarded' };
    }
  }

  return releaseCampaignCredit(client, {
    referenceId: campaignPayReference(orderId),
    reason: input.reason,
  });
}

export async function releaseAuctionCampaignCredits(
  client: CreditLedgerClient,
  auctionId: string,
  reason: string,
): Promise<
  | { ok: true; restoredCount: number; restoredAmount: number }
  | { ok: false; code: string; message: string }
> {
  const { data, error } = await client
    .from('payments')
    .select('order_id')
    .eq('auction_id', auctionId);
  if (error) {
    return { ok: false, code: 'RPC_ERROR', message: error.message };
  }

  let restoredCount = 0;
  let restoredAmount = 0;
  for (const row of data ?? []) {
    if (!row.order_id) {
      continue;
    }
    const released = await releaseCampaignCredit(client, {
      referenceId: campaignPayReference(row.order_id),
      reason,
    });
    if (!released.ok) {
      return released;
    }
    if (released.restored) {
      restoredCount += 1;
      restoredAmount += released.amount;
    }
  }
  return { ok: true, restoredCount, restoredAmount };
}
