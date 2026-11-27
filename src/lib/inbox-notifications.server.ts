import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { uuidIds } from '@/lib/uuid';
import type { AppNotification, NotificationType } from '@/types/notification';

type SlotRow = {
  id?: string | null;
  creator_id?: string | null;
  creator_name?: string | null;
  title?: string | null;
  status?: string | null;
  winner_bid_id?: string | null;
  delivery_url?: string | null;
  delivered_at?: string | null;
  purchase_confirmed_at?: string | null;
  created_at?: string | null;
};

type SlotBidRow = {
  id?: string | null;
  time_slot_id?: string | null;
  advertiser_id?: string | null;
  advertiser_name?: string | null;
  created_at?: string | null;
};

type AuctionRow = {
  id?: string | null;
  title?: string | null;
  author_id?: string | null;
  winner_bid_id?: string | null;
  category?: string | null;
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
  bid_id?: string | null;
  status?: string | null;
  created_at?: string | null;
  confirmed_at?: string | null;
};

const SLOT_COLUMNS =
  'id, creator_id, creator_name, title, status, winner_bid_id, delivery_url, delivered_at, purchase_confirmed_at, created_at';
const SLOT_BID_COLUMNS = 'id, time_slot_id, advertiser_id, advertiser_name, created_at';
const AUCTION_COLUMNS = 'id, title, author_id, winner_bid_id, category, created_at';
const CAMPAIGN_BID_COLUMNS = 'id, auction_id, creator_id, creator_name, status, created_at';
const PAYMENT_COLUMNS = 'auction_id, bid_id, status, created_at, confirmed_at';

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asIso(value: unknown, fallback: string) {
  return asText(value) || fallback;
}

type ProfileReviewRow = {
  business_verification_status?: string | null;
  business_status_detail?: string | null;
  business_checked_at?: string | null;
};

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
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
): Promise<ProfileReviewRow | null> {
  try {
    const result = await admin
      .from('profiles')
      .select('business_verification_status, business_status_detail, business_checked_at')
      .eq('id', userId)
      .maybeSingle();
    return result.data ?? null;
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

export async function listInboxNotifications(userId: string): Promise<AppNotification[]> {
  const actorId = asText(userId);
  if (!actorId) {
    return [];
  }

  const admin = createAdminClient();
  if (!admin) {
    return [];
  }

  const items: AppNotification[] = [];
  const nowIso = new Date().toISOString();

  const [ownedSlots, appliedSlotBids, ownedCampaigns, appliedCampaignBids, profile] = await Promise.all([
    selectRows<SlotRow>(admin.from('time_slots').select(SLOT_COLUMNS).eq('creator_id', actorId)),
    selectRows<SlotBidRow>(
      admin.from('time_slot_bids').select(SLOT_BID_COLUMNS).eq('advertiser_id', actorId),
    ),
    selectRows<AuctionRow>(admin.from('auctions').select(AUCTION_COLUMNS).eq('author_id', actorId)),
    selectRows<CampaignBidRow>(
      admin.from('bids').select(CAMPAIGN_BID_COLUMNS).eq('creator_id', actorId),
    ),
    selectProfileReview(admin, actorId),
  ]);

  const ownedSlotIds = uuidIds(ownedSlots.map((row: SlotRow) => row.id));
  const appliedSlotIds = uuidIds(appliedSlotBids.map((row: SlotBidRow) => row.time_slot_id));
  const ownedCampaignIds = uuidIds(ownedCampaigns.map((row: AuctionRow) => row.id));
  const appliedCampaignIds = uuidIds(appliedCampaignBids.map((row: CampaignBidRow) => row.auction_id));

  const [bidsOnOwnedSlots, appliedSlots, bidsOnOwnedCampaigns, appliedCampaigns] = await Promise.all([
    ownedSlotIds.length > 0
      ? selectRows<SlotBidRow>(
          admin.from('time_slot_bids').select(SLOT_BID_COLUMNS).in('time_slot_id', ownedSlotIds),
        )
      : Promise.resolve([] as SlotBidRow[]),
    appliedSlotIds.length > 0
      ? selectRows<SlotRow>(admin.from('time_slots').select(SLOT_COLUMNS).in('id', appliedSlotIds))
      : Promise.resolve([] as SlotRow[]),
    ownedCampaignIds.length > 0
      ? selectRows<CampaignBidRow>(
          admin.from('bids').select(CAMPAIGN_BID_COLUMNS).in('auction_id', ownedCampaignIds),
        )
      : Promise.resolve([] as CampaignBidRow[]),
    appliedCampaignIds.length > 0
      ? selectRows<AuctionRow>(
          admin.from('auctions').select(AUCTION_COLUMNS).in('id', appliedCampaignIds),
        )
      : Promise.resolve([] as AuctionRow[]),
  ]);

  const slotMap = new Map<string, SlotRow>();
  for (const row of [...ownedSlots, ...appliedSlots]) {
    const id = asText(row.id);
    if (id) {
      slotMap.set(id, row);
    }
  }
  const slotBidMap = new Map<string, SlotBidRow[]>();
  for (const row of [...bidsOnOwnedSlots, ...appliedSlotBids]) {
    const slotId = asText(row.time_slot_id);
    if (!slotId) {
      continue;
    }
    const list = slotBidMap.get(slotId) ?? [];
    if (!list.some((item) => item.id === row.id)) {
      list.push(row);
      slotBidMap.set(slotId, list);
    }
  }

  const auctionMap = new Map<string, AuctionRow>();
  for (const row of [...ownedCampaigns, ...appliedCampaigns]) {
    const id = asText(row.id);
    if (id) {
      auctionMap.set(id, row);
    }
  }
  const campaignBidMap = new Map<string, CampaignBidRow[]>();
  for (const row of [...bidsOnOwnedCampaigns, ...appliedCampaignBids]) {
    const auctionId = asText(row.auction_id);
    if (!auctionId) {
      continue;
    }
    const list = campaignBidMap.get(auctionId) ?? [];
    if (!list.some((item) => item.id === row.id)) {
      list.push(row);
      campaignBidMap.set(auctionId, list);
    }
  }

  const dealIds = uuidIds([...slotMap.keys(), ...auctionMap.keys()]);
  const payments =
    dealIds.length > 0
      ? await selectRows<PaymentRow>(
          admin.from('payments').select(PAYMENT_COLUMNS).in('auction_id', dealIds),
        )
      : [];
  const { paid, started } = paidAtByDeal(payments);

  for (const slot of slotMap.values()) {
    const slotId = asText(slot.id);
    const title = asText(slot.title) || '크리에이터 상품';
    const creatorId = asText(slot.creator_id);
    const winnerBidId = asText(slot.winner_bid_id);
    const bids = slotBidMap.get(slotId) ?? [];
    const winner = winnerBidId ? bids.find((bid) => asText(bid.id) === winnerBidId) : undefined;
    const winnerAdvertiserId = asText(winner?.advertiser_id);
    const paidAt = paid.get(slotId) ?? '';
    const deliveredAt =
      asText(slot.delivered_at) || (asText(slot.delivery_url) ? paidAt || nowIso : '');
    const confirmedAt = asText(slot.purchase_confirmed_at);

    if (creatorId === actorId) {
      for (const bid of bids) {
        const bidId = asText(bid.id);
        if (!bidId) {
          continue;
        }
        const advertiserName = asText(bid.advertiser_name) || '광고주';
        items.push(
          makeItem({
            id: `slot-apply-${bidId}`,
            userId: actorId,
            type: 'timeslot_bid',
            title: '제작 신청',
            body: `${advertiserName}님이 "${title}"에 제작 신청했습니다.`,
            href: slotHref(slotId),
            createdAt: asIso(bid.created_at, nowIso),
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

    if (winnerAdvertiserId === actorId && winnerBidId && !paidAt) {
      items.push(
        makeItem({
          id: `slot-award-${slotId}`,
          userId: actorId,
          type: 'award_complete',
          title: '결제 대기',
          body: `"${title}" 광고주 선정이 완료되었습니다. 에스크로 결제를 진행해 주세요.`,
          href: slotHref(slotId),
          createdAt: asIso(started.get(slotId) || winner?.created_at, nowIso),
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

  for (const auction of auctionMap.values()) {
    const auctionId = asText(auction.id);
    const title = asText(auction.title) || '오픈 캠페인';
    const authorId = asText(auction.author_id);
    const winnerBidId = asText(auction.winner_bid_id);
    const bids = campaignBidMap.get(auctionId) ?? [];
    const winner = winnerBidId ? bids.find((bid) => asText(bid.id) === winnerBidId) : undefined;
    const winnerCreatorId = asText(winner?.creator_id);
    const paidAt = paid.get(auctionId) ?? '';

    if (authorId === actorId) {
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
            href: campaignHref(auctionId),
            createdAt: asIso(bid.created_at, nowIso),
          }),
        );
      }
    }

    if (winnerCreatorId === actorId && paidAt) {
      items.push(
        makeItem({
          id: `campaign-paid-${auctionId}`,
          userId: actorId,
          type: 'payment_complete',
          title: '결제 완료 · 제작/납품 요청',
          body: `"${title}" 에스크로 결제가 완료되었습니다. 결과물을 납품해 주세요.`,
          href: campaignHref(auctionId),
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
