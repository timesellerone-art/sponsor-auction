import 'server-only';

import { getAuctionsByAuthor, getBidsByAuctionIds } from '@/lib/auctions';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import {
  listTimeSlotBidsBySlotIds,
  listTimeSlotBidsForAdvertiser,
  listTimeSlots,
  listTimeSlotsByIds,
} from '@/lib/timeslots';
import { uuidIds } from '@/lib/uuid';
import type { AppNotification, NotificationType } from '@/types/notification';
import type { TimeSlotBidItem, TimeSlotItem } from '@/types/timeslot';

type AuctionRow = {
  id?: string | null;
  title?: string | null;
  author_id?: string | null;
  winner_bid_id?: string | null;
  created_at?: string | null;
};

type CampaignBidRow = {
  id?: string | null;
  auction_id?: string | null;
  creator_id?: string | null;
  creator_name?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type PaymentRow = {
  auction_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
};

type ProfileReviewRow = {
  business_verification_status?: string | null;
  business_status_detail?: string | null;
  business_checked_at?: string | null;
};

const CAMPAIGN_BID_COLUMNS = 'id, auction_id, creator_id, creator_name, status, created_at';
const PAYMENT_COLUMNS = 'auction_id, status, created_at, confirmed_at';

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asIso(value: unknown, fallback: string) {
  return asText(value) || fallback;
}

async function inboxReader() {
  return createAdminClient() ?? (await createClient());
}

async function selectRows<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await query;
    if (error || !data) {
      return [];
    }
    return data;
  } catch {
    return [];
  }
}

async function selectProfileReview(
  reader: NonNullable<Awaited<ReturnType<typeof inboxReader>>>,
  userId: string,
): Promise<ProfileReviewRow | null> {
  try {
    const result = await reader
      .from('profiles')
      .select('business_verification_status, business_status_detail, business_checked_at')
      .eq('id', userId)
      .maybeSingle();
    if (result.error && isSchemaMismatch(result.error)) {
      return null;
    }
    return (result.data as ProfileReviewRow | null) ?? null;
  } catch {
    return null;
  }
}

function makeItem(input: {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  createdAt: string;
}): AppNotification {
  return {
    ...input,
    read: false,
  };
}

function slotHref(id: string) {
  return `/inventory/${id}`;
}

function campaignHref(id: string) {
  return `/campaigns/${id}`;
}

function paidAtByDeal(payments: PaymentRow[]) {
  const paid = new Map<string, string>();
  const started = new Map<string, string>();
  for (const row of payments) {
    const dealId = asText(row.auction_id);
    if (!dealId) {
      continue;
    }
    const created = asText(row.created_at);
    if (created && !started.has(dealId)) {
      started.set(dealId, created);
    }
    if (row.status === 'confirmed') {
      const confirmed = asText(row.confirmed_at) || created;
      if (confirmed && !paid.has(dealId)) {
        paid.set(dealId, confirmed);
      }
    }
  }
  return { paid, started };
}

function mergeSlots(groups: TimeSlotItem[][]) {
  const map = new Map<string, TimeSlotItem>();
  for (const group of groups) {
    for (const slot of group) {
      if (slot.id) {
        map.set(slot.id, slot);
      }
    }
  }
  return map;
}

function mergeSlotBids(groups: TimeSlotBidItem[][]) {
  const map = new Map<string, TimeSlotBidItem[]>();
  for (const group of groups) {
    for (const bid of group) {
      const slotId = asText(bid.timeSlotId);
      if (!slotId) {
        continue;
      }
      const list = map.get(slotId) ?? [];
      if (!list.some((item) => item.id === bid.id)) {
        list.push(bid);
        map.set(slotId, list);
      }
    }
  }
  return map;
}

export async function listInboxNotifications(userId: string): Promise<AppNotification[]> {
  const actorId = asText(userId);
  if (!actorId) {
    return [];
  }

  const reader = await inboxReader();
  if (!reader) {
    return [];
  }

  const items: AppNotification[] = [];
  const nowIso = new Date().toISOString();

  const [ownedSlotsResult, appliedSlotBidsResult, ownedCampaignsResult, appliedCampaignBids, profile] =
    await Promise.all([
      listTimeSlots({ creatorId: actorId, client: reader, includeHidden: true }),
      listTimeSlotBidsForAdvertiser(actorId, reader),
      getAuctionsByAuthor(actorId, { client: reader }),
      selectRows<CampaignBidRow>(
        reader.from('bids').select(CAMPAIGN_BID_COLUMNS).eq('creator_id', actorId),
      ),
      selectProfileReview(reader, actorId),
    ]);

  const ownedSlots = ownedSlotsResult.data ?? [];
  const appliedSlotBids = appliedSlotBidsResult.data ?? [];
  const ownedCampaigns = ownedCampaignsResult.data ?? [];
  const appliedSlotIds = appliedSlotBids.map((bid) => bid.timeSlotId);
  const appliedCampaignIds = uuidIds(appliedCampaignBids.map((row) => row.auction_id));
  const ownedCampaignIds = uuidIds(ownedCampaigns.map((item) => item.id));

  const [bidsOnOwnedSlotsResult, appliedSlotsResult, bidsOnOwnedCampaigns, appliedCampaigns] =
    await Promise.all([
      listTimeSlotBidsBySlotIds(
        ownedSlots.map((slot) => slot.id),
        reader,
      ),
      listTimeSlotsByIds(appliedSlotIds, reader),
      ownedCampaignIds.length > 0
        ? getBidsByAuctionIds(ownedCampaignIds, { client: reader })
        : Promise.resolve({ data: [], error: null }),
      appliedCampaignIds.length > 0
        ? selectRows<AuctionRow>(
            reader.from('auctions').select('id, title, author_id, winner_bid_id, created_at').in('id', appliedCampaignIds),
          )
        : Promise.resolve([] as AuctionRow[]),
    ]);

  const slotMap = mergeSlots([ownedSlots, appliedSlotsResult.data ?? []]);
  const slotBidMap = mergeSlotBids([bidsOnOwnedSlotsResult.data ?? [], appliedSlotBids]);

  const dealIds = uuidIds([
    ...slotMap.keys(),
    ...ownedCampaignIds,
    ...appliedCampaignIds,
  ]);
  const payments =
    dealIds.length > 0
      ? await selectRows<PaymentRow>(
          reader.from('payments').select(PAYMENT_COLUMNS).in('auction_id', dealIds),
        )
      : [];
  const { paid, started } = paidAtByDeal(payments);

  for (const slot of slotMap.values()) {
    const slotId = slot.id;
    const title = asText(slot.title) || '크리에이터 상품';
    const creatorId = asText(slot.creatorId);
    const winnerBidId = asText(slot.winnerBidId);
    const bids = slotBidMap.get(slotId) ?? [];
    const winner = winnerBidId ? bids.find((bid) => bid.id === winnerBidId) : undefined;
    const winnerAdvertiserId = asText(winner?.advertiserId);
    const paidAt = asText(slot.paidAt) || paid.get(slotId) || '';
    const deliveredAt =
      asText(slot.deliveredAt) || (asText(slot.deliveryUrl) ? paidAt || nowIso : '');
    const confirmedAt = asText(slot.purchaseConfirmedAt);
    const awarded = Boolean(winnerBidId) || slot.status === 'awarded';

    if (creatorId === actorId) {
      for (const bid of bids) {
        const bidId = asText(bid.id);
        if (!bidId) {
          continue;
        }
        const advertiserName = asText(bid.advertiserName) || '광고주';
        items.push(
          makeItem({
            id: `slot-apply-${bidId}`,
            userId: actorId,
            type: 'timeslot_bid',
            title: '새 광고주 신청 접수',
            body: `${advertiserName}님이 "${title}"에 제작 신청했습니다.`,
            href: slotHref(slotId),
            createdAt: asIso(bid.createdAt, nowIso),
          }),
        );
      }

      if (paidAt) {
        items.push(
          makeItem({
            id: `slot-paid-${slotId}`,
            userId: actorId,
            type: 'payment_complete',
            title: '결제 완료 · 제작/납품 요청',
            body: `"${title}" 에스크로 결제가 완료되었습니다. 결과물을 납품해 주세요.`,
            href: slotHref(slotId),
            createdAt: paidAt,
          }),
        );
      }

      if (confirmedAt) {
        items.push(
          makeItem({
            id: `slot-confirmed-${slotId}`,
            userId: actorId,
            type: 'purchase_confirmed',
            title: '구매 확정 · 정산 예정',
            body: `"${title}" 구매가 확정되었습니다. 정산이 예정되어 있습니다.`,
            href: slotHref(slotId),
            createdAt: confirmedAt,
          }),
        );
      }
    }

    if (winnerAdvertiserId === actorId && awarded && !paidAt) {
      items.push(
        makeItem({
          id: `slot-award-${slotId}`,
          userId: actorId,
          type: 'award_complete',
          title: '광고주 선정 · 결제 대기',
          body: `"${title}" 광고주 선정이 완료되었습니다. 에스크로 결제를 진행해 주세요.`,
          href: slotHref(slotId),
          createdAt: asIso(started.get(slotId) || winner?.createdAt, nowIso),
        }),
      );
    }

    if (winnerAdvertiserId === actorId && deliveredAt) {
      items.push(
        makeItem({
          id: `slot-delivered-${slotId}`,
          userId: actorId,
          type: 'delivery_complete',
          title: '납품 완료 · 구매 확정 요청',
          body: `"${title}" 결과물이 납품되었습니다. 구매를 확정해 주세요.`,
          href: slotHref(slotId),
          createdAt: deliveredAt,
        }),
      );
    }
  }

  const campaignBidMap = new Map<string, CampaignBidRow[]>();
  const ownedCampaignBidRows: CampaignBidRow[] = (bidsOnOwnedCampaigns.data ?? []).map((bid) => ({
    id: bid.id,
    auction_id: bid.auctionId,
    creator_id: bid.creatorId,
    creator_name: bid.creatorName,
    status: bid.status,
    created_at: bid.createdAt,
  }));
  for (const bid of [...ownedCampaignBidRows, ...appliedCampaignBids]) {
    const auctionId = asText(bid.auction_id);
    if (!auctionId) {
      continue;
    }
    const list = campaignBidMap.get(auctionId) ?? [];
    if (!list.some((item) => item.id === bid.id)) {
      list.push(bid);
      campaignBidMap.set(auctionId, list);
    }
  }

  const campaignMap = new Map<string, { id: string; title: string; authorId: string; winnerBidId: string }>();
  for (const auction of ownedCampaigns) {
    campaignMap.set(auction.id, {
      id: auction.id,
      title: auction.title,
      authorId: asText(auction.authorId),
      winnerBidId: asText(auction.winnerBidId),
    });
  }
  for (const row of appliedCampaigns) {
    const id = asText(row.id);
    if (!id || campaignMap.has(id)) {
      continue;
    }
    campaignMap.set(id, {
      id,
      title: asText(row.title) || '오픈 캠페인',
      authorId: asText(row.author_id),
      winnerBidId: asText(row.winner_bid_id),
    });
  }

  for (const auction of campaignMap.values()) {
    const title = asText(auction.title) || '오픈 캠페인';
    const bids = campaignBidMap.get(auction.id) ?? [];
    const winner = auction.winnerBidId
      ? bids.find((bid) => asText(bid.id) === auction.winnerBidId)
      : undefined;
    const winnerCreatorId = asText(winner?.creator_id);
    const paidAt = paid.get(auction.id) ?? '';

    if (auction.authorId === actorId) {
      for (const bid of bids) {
        const bidId = asText(bid.id);
        if (!bidId) {
          continue;
        }
        const creatorName = asText(bid.creator_name) || '크리에이터';
        items.push(
          makeItem({
            id: `campaign-apply-${bidId}`,
            userId: actorId,
            type: 'bid_received',
            title: '지원 접수',
            body: `${creatorName}님이 "${title}"에 지원했습니다.`,
            href: campaignHref(auction.id),
            createdAt: asIso(bid.created_at, nowIso),
          }),
        );
      }
    }

    if (winnerCreatorId === actorId && paidAt) {
      items.push(
        makeItem({
          id: `campaign-paid-${auction.id}`,
          userId: actorId,
          type: 'payment_complete',
          title: '결제 완료 · 제작/납품 요청',
          body: `"${title}" 에스크로 결제가 완료되었습니다. 결과물을 납품해 주세요.`,
          href: campaignHref(auction.id),
          createdAt: paidAt,
        }),
      );
    }
  }

  const businessStatus = asText(profile?.business_verification_status);
  const checkedAt = asText(profile?.business_checked_at);
  if (checkedAt && (businessStatus === 'verified' || businessStatus === 'rejected')) {
    const approved = businessStatus === 'verified';
    const detail = asText(profile?.business_status_detail);
    items.push(
      makeItem({
        id: `business-${businessStatus}-${checkedAt}`,
        userId: actorId,
        type: 'business_review',
        title: approved ? '사업자 승인' : '사업자 반려',
        body:
          detail ||
          (approved
            ? '관리자가 사업자 인증을 승인했습니다.'
            : '관리자가 사업자 인증을 반려했습니다.'),
        href: '/my/settings',
        createdAt: checkedAt,
      }),
    );
  }

  return items.sort((left, right) => right.createdAt.localeCompare(left.createdAt)).slice(0, 80);
}
