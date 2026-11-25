import {
  awardBid as awardMockBid,
  createAuction as createMockAuction,
  createBid as createMockBid,
  deleteAuction as deleteMockAuction,
  getAuctionById as getMockAuctionById,
  getAuctions as getMockAuctions,
  getBids as getMockBids,
  getBidsByAuctionId as getMockBidsByAuctionId,
  getBidsByAuctionIds as getMockBidsByAuctionIds,
  getBidsByCreator as getMockBidsByCreator,
  updateAuctionBlind as updateMockAuctionBlind,
  updateAuctionStatus as updateMockAuctionStatus,
} from '@/lib/mock-data';
import { withExclusiveAction } from '@/lib/action-lock';
import { DEMO_ADVERTISER_ID } from '@/lib/auth-mock';
import { isCampaignAuthor } from '@/lib/my-campaigns';
import { notifyLifecycleEvent } from '@/lib/notification';
import { type SponsorAuctionClient } from '@/lib/supabase';
import { getDataClient } from '@/lib/supabase/data-client';
import { businessActionBlock } from '@/lib/business-registration';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { isInvalidUuidError, isUuid, uuidIds } from '@/lib/uuid';
import {
  VALIDATION,
  getAwardBlockReason,
  validateAuctionPayload,
  validateBidPayload,
} from '@/lib/validation';
import {
  isAuctionClosed,
  type AuctionItem,
  type AuctionStatus,
  type BidItem,
  type BidStatus,
  type CreateAuctionInput,
  type CreateBidInput,
  type DataResult,
} from '@/types/auction';
import {
  computeBidEngineStats,
  expiredAuctionStatus,
} from '@/lib/auction-engine';
import { attachScore, getCreatorScoresByIds } from '@/lib/creator-metrics';
import {
  isCampaignCategoryId,
  parseCategoryFromDescription,
  parseImageFromDescription,
  withCategoryMarker,
  withImageMarker,
} from '@/lib/campaign-presentation';
import { isPlatformType } from '@/lib/platforms';
import type { Database } from '@/types/database';
import {
  OffPlatformContactError,
  maskOffPlatformContact,
  sanitizeUserText,
} from '@/utils/filter';

export const INSERT_FAIL_MESSAGE = '등록에 실패했습니다. 다시 시도해 주세요.';
export const UPDATE_FAIL_MESSAGE = '변경에 실패했습니다. 다시 시도해 주세요.';

const AUCTION_COLUMNS =
  'id, title, platform, budget, description, status, is_blind, author_id, author_name, winner_bid_id, deadline, created_at, updated_at, bids_count, leading_bid_amount, highest_bid_amount, image_url, thumbnail_url, category';

const AUCTION_COLUMNS_WITHOUT_IMAGES =
  'id, title, platform, budget, description, status, is_blind, author_id, author_name, winner_bid_id, deadline, created_at, updated_at, bids_count, leading_bid_amount, highest_bid_amount, category';

const AUCTION_COLUMNS_WITHOUT_CATEGORY =
  'id, title, platform, budget, description, status, is_blind, author_id, author_name, winner_bid_id, deadline, created_at, updated_at, bids_count, leading_bid_amount, highest_bid_amount';

const AUCTION_COLUMNS_CORE =
  'id, title, platform, budget, description, status, deadline, created_at, bids_count';

const AUCTION_SELECT_CANDIDATES = [
  AUCTION_COLUMNS,
  AUCTION_COLUMNS_WITHOUT_IMAGES,
  AUCTION_COLUMNS_WITHOUT_CATEGORY,
  AUCTION_COLUMNS_CORE,
] as const;

let resolvedAuctionSelect: string | null = null;

type AuctionQueryResult<T> = {
  data: T;
  error: { message?: string; code?: string } | null;
};

async function withAuctionSelect<T>(
  run: (columns: string) => PromiseLike<AuctionQueryResult<T>>,
): Promise<AuctionQueryResult<T>> {
  const candidates = resolvedAuctionSelect
    ? [
        resolvedAuctionSelect,
        ...AUCTION_SELECT_CANDIDATES.filter((item) => item !== resolvedAuctionSelect),
      ]
    : [...AUCTION_SELECT_CANDIDATES];

  let last: AuctionQueryResult<T> | null = null;
  for (const columns of candidates) {
    const result = await run(columns);
    last = result;
    if (!result.error) {
      resolvedAuctionSelect = columns;
      return result;
    }
    if (!isSchemaMismatch(result.error)) {
      return result;
    }
  }
  return last as AuctionQueryResult<T>;
}

const BID_COLUMNS =
  'id, auction_id, creator_id, creator_name, creator_channel_url, bid_amount, proposal_text, status, created_at, bank_name, account_number, account_holder';

const BID_COLUMNS_CORE =
  'id, auction_id, creator_name, creator_channel_url, bid_amount, proposal_text, status, created_at';

type AuctionRow = Database['public']['Tables']['auctions']['Row'];
type BidRow = Database['public']['Tables']['bids']['Row'];

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

function rowImageUrl(row: Partial<AuctionRow>) {
  const image = row.image_url?.trim() || '';
  const thumb = row.thumbnail_url?.trim() || '';
  return image || thumb || parseImageFromDescription(row.description) || null;
}

function asAuctionStatus(
  status: string | undefined,
  deadline: string | undefined,
  winnerBidId: string | null,
): AuctionStatus {
  const next = expiredAuctionStatus(status ?? 'active', deadline ?? '', winnerBidId);
  if (
    next === 'active' ||
    next === 'matched' ||
    next === 'completed' ||
    next === 'cancelled' ||
    next === 'closed'
  ) {
    if (next === 'active' && winnerBidId) {
      return 'closed';
    }
    return next;
  }
  return winnerBidId ? 'closed' : 'active';
}

function mapAuction(row: unknown): AuctionItem {
  const record = row as Partial<AuctionRow> & Pick<AuctionRow, 'id'>;
  const platformRaw = String(record.platform ?? '');
  const winnerBidId = record.winner_bid_id ?? null;
  return {
    id: record.id,
    title: record.title ?? '제목 없음',
    platform: isPlatformType(platformRaw) ? platformRaw : 'other',
    budget: record.budget ?? 0,
    description: record.description ?? '',
    status: asAuctionStatus(record.status ?? 'active', record.deadline ?? '', winnerBidId),
    isBlind: Boolean(record.is_blind),
    authorId: record.author_id ?? null,
    authorName: record.author_name?.trim() || '미상',
    winnerBidId,
    deadline: record.deadline ?? '',
    createdAt: record.created_at ?? '',
    bidsCount: record.bids_count ?? 0,
    leadingBidAmount: Number(record.leading_bid_amount) || 0,
    highestBidAmount: Number(record.highest_bid_amount) || 0,
    imageUrl: rowImageUrl(record),
    category: isCampaignCategoryId(record.category)
      ? record.category
      : parseCategoryFromDescription(record.description),
  };
}

async function overlayPaidAuctions(
  client: SponsorAuctionClient,
  auctions: AuctionItem[],
): Promise<AuctionItem[]> {
  if (auctions.length === 0) {
    return auctions;
  }
  const paidByAuction = new Map<string, string>();
  const { data, error } = await client
    .from('payments')
    .select('auction_id, bid_id')
    .eq('status', 'confirmed')
    .in(
      'auction_id',
      auctions.map((auction) => auction.id),
    );
  if (!error && data) {
    for (const row of data) {
      const auctionId = row.auction_id?.trim();
      const bidId = row.bid_id?.trim();
      if (auctionId && bidId && !paidByAuction.has(auctionId)) {
        paidByAuction.set(auctionId, bidId);
      }
    }
  }
  return auctions.map((auction) => {
    if (auction.status === 'cancelled') {
      return auction;
    }
    const paidBidId = paidByAuction.get(auction.id);
    const winnerBidId = auction.winnerBidId || paidBidId || null;
    if (!winnerBidId) {
      return auction;
    }
    return {
      ...auction,
      status: isAuctionClosed(auction.status) ? auction.status : 'closed',
      winnerBidId,
    };
  });
}

function mapBid(row: Partial<BidRow> & Pick<BidRow, 'id'>): BidItem {
  return {
    id: row.id,
    auctionId: row.auction_id ?? '',
    creatorId: row.creator_id ?? null,
    creatorName: row.creator_name ?? '이름 없음',
    creatorChannelUrl: row.creator_channel_url ?? '',
    bidAmount: row.bid_amount ?? 0,
    proposalText: maskOffPlatformContact(row.proposal_text ?? ''),
    bankName: row.bank_name ?? '',
    accountNumber: row.account_number ?? '',
    accountHolder: row.account_holder ?? '',
    status: (row.status === 'selected' ? 'selected' : 'pending') as BidStatus,
    createdAt: row.created_at ?? '',
  };
}

async function withBidScores(bids: BidItem[]): Promise<BidItem[]> {
  const scores = await getCreatorScoresByIds(bids.map((item) => item.creatorId));
  return bids.map((item) => attachScore(item, scores));
}

async function syncAuctionBidEngine(
  client: SponsorAuctionClient,
  auctionId: string,
  extraBidAmount?: number,
) {
  try {
    const { data } = await client.from('bids').select('bid_amount').eq('auction_id', auctionId);
    const amounts = (data ?? []).map((row) => Number(row.bid_amount) || 0);
    if (typeof extraBidAmount === 'number') {
      amounts.push(extraBidAmount);
    }
    const stats = computeBidEngineStats(amounts);
    await client
      .from('auctions')
      .update({
        leading_bid_amount: stats.leadingBidAmount,
        highest_bid_amount: stats.highestBidAmount,
        bids_count: stats.bidsCount,
      })
      .eq('id', auctionId);
  } catch {
    // 엔진 컬럼이 아직 없으면 입찰 저장은 유지합니다.
  }
}

function logDbError(action: string, error: unknown) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error);
  const code =
    typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: unknown }).code)
      : undefined;
  if (isInvalidUuidError({ message: detail, code })) {
    console.warn(`[SponsorAuction] ${action} UUID 형식이 아니어서 건너뜁니다.`, detail);
    return;
  }
  if (isSchemaMismatch({ message: detail, code })) {
    console.warn(`[SponsorAuction] ${action}: 스키마 호환 모드로 재시도합니다.`, detail);
    return;
  }
  console.error(`[SponsorAuction] ${action} 실패:`, detail, error);
}

export async function getAuctions(): Promise<DataResult<AuctionItem[]>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockAuctions();
  }

  try {
    const { data, error } = await withAuctionSelect((columns) =>
      supabase.from('auctions').select(columns).order('created_at', { ascending: false }),
    );

    if (error) {
      logDbError('경매 목록 조회', error);
      return getMockAuctions();
    }

    const auctions = await overlayPaidAuctions(supabase, (data ?? []).map((row) => mapAuction(row)));
    if (auctions.length === 0) {
      return getMockAuctions();
    }

    return ok(auctions);
  } catch (error) {
    logDbError('경매 목록 조회 예외', error);
    return getMockAuctions();
  }
}

const DEMO_ADVERTISER_CAMPAIGN_IDS = new Set(['auc-001', 'auc-002', 'auc-004']);

async function getMockAuctionsByAuthor(userId: string): Promise<DataResult<AuctionItem[]>> {
  const result = await getMockAuctions();
  const owned = result.data.filter((item) => item.authorId && item.authorId === userId);
  if (owned.length > 0) {
    return ok(owned);
  }
  if (userId === DEMO_ADVERTISER_ID) {
    return ok(result.data.filter((item) => DEMO_ADVERTISER_CAMPAIGN_IDS.has(item.id)));
  }
  return ok([]);
}

async function fetchAuctionsForAuthor(
  client: SponsorAuctionClient,
  authorId: string,
  extraIds: string[] = [],
): Promise<AuctionItem[]> {
  const ownedExtraIds = uuidIds(extraIds);
  const pageSize = 1000;
  const rows: unknown[] = [];
  for (let from = 0; from < 10_000; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await withAuctionSelect((columns) => {
      const query = client
        .from('auctions')
        .select(columns)
        .order('created_at', { ascending: false })
        .range(from, to);
      if (ownedExtraIds.length > 0) {
        return query.or(`author_id.eq.${authorId},id.in.(${ownedExtraIds.join(',')})`);
      }
      return query.eq('author_id', authorId);
    });
    if (error) {
      if (from === 0) {
        logDbError('광고주 경매 목록 조회', error);
        throw error;
      }
      break;
    }
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }

  const auctions = await overlayPaidAuctions(
    client,
    rows.map((row) => mapAuction(row)),
  );
  return auctions.filter((auction) => !auction.authorId || auction.authorId === authorId);
}

/** 로그인한 광고주가 등록한 캠페인만 조회합니다. 샘플/타 계정 데이터는 포함하지 않습니다. */
export async function getAuctionsByAuthor(
  userId: string,
  options?: AuctionQueryOptions,
): Promise<DataResult<AuctionItem[]>> {
  const authorId = userId.trim();
  if (!authorId) {
    return fail([], '유효한 광고주 ID가 필요합니다.');
  }

  if (!isUuid(authorId)) {
    return getMockAuctionsByAuthor(authorId);
  }

  const supabase = await resolveAuctionClient(options);
  if (!supabase) {
    return getMockAuctionsByAuthor(authorId);
  }

  try {
    return ok(await fetchAuctionsForAuthor(supabase, authorId, options?.extraIds));
  } catch (error) {
    logDbError('광고주 경매 목록 조회 예외', error);
    return fail([], '캠페인 목록을 불러오지 못했습니다.');
  }
}

/** 지정한 캠페인만 조회합니다. 공개 오픈 목록·관리자 전체 목록과 분리합니다. */
export async function getAuctionsByIds(ids: string[]): Promise<DataResult<AuctionItem[]>> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return ok([]);
  }

  const supabase = await getDataClient();
  const uuids = uuidIds(unique);
  if (!supabase || uuids.length === 0) {
    const mock = await getMockAuctions();
    return ok((mock.data ?? []).filter((item) => unique.includes(item.id)));
  }

  try {
    const { data, error } = await withAuctionSelect((columns) =>
      supabase.from('auctions').select(columns).in('id', uuids).order('created_at', { ascending: false }),
    );
    if (error) {
      logDbError('캠페인 지정 조회', error);
      return fail([], '캠페인 정보를 불러오지 못했습니다.');
    }
    return ok(await overlayPaidAuctions(supabase, (data ?? []).map((row) => mapAuction(row))));
  } catch (error) {
    logDbError('캠페인 지정 조회 예외', error);
    return fail([], '캠페인 정보를 불러오지 못했습니다.');
  }
}

type AuctionQueryOptions = {
  client?: SponsorAuctionClient | null;
  extraIds?: string[];
};

async function resolveAuctionClient(options?: AuctionQueryOptions) {
  if (options?.client) {
    return options.client;
  }
  return getDataClient();
}

export async function getAuctionById(
  id: string,
  options?: AuctionQueryOptions,
): Promise<DataResult<AuctionItem | null>> {
  const auctionId = id.trim();
  const supabase = await resolveAuctionClient(options);
  if (!supabase) {
    return getMockAuctionById(auctionId);
  }

  try {
    if (!auctionId) {
      return fail(null, '유효한 캠페인 ID가 필요합니다.');
    }
    if (!isUuid(auctionId)) {
      return getMockAuctionById(auctionId);
    }

    const { data, error } = await withAuctionSelect((columns) =>
      supabase.from('auctions').select(columns).eq('id', auctionId).maybeSingle(),
    );

    if (error) {
      logDbError('경매 단건 조회', error);
      if (isInvalidUuidError(error)) {
        return getMockAuctionById(auctionId);
      }
      return fail(null, '캠페인 정보를 불러오지 못했습니다.');
    }

    if (!data) {
      if (options?.client) {
        return fail(null, '해당 캠페인을 찾을 수 없습니다.');
      }
      return getMockAuctionById(auctionId);
    }

    return ok(mapAuction(data));
  } catch (error) {
    logDbError('경매 단건 조회 예외', error);
    return fail(null, '캠페인 정보를 불러오지 못했습니다.');
  }
}

export async function createAuction(
  input: CreateAuctionInput,
): Promise<DataResult<AuctionItem | null>> {
  const auctionError = validateAuctionPayload({
    title: input.title,
    budget: input.budget,
    description: input.description,
    deadline: input.deadline,
  });
  if (auctionError) {
    return fail(null, auctionError);
  }

  const supabase = await getDataClient();
  if (!supabase) {
    return createMockAuction(input);
  }

  try {
    const authorId = await resolveAuthUserId(supabase, input.authorId);
    if (authorId && isUuid(authorId)) {
      const business = await supabase
        .from('profiles')
        .select('business_verification_status')
        .eq('id', authorId)
        .maybeSingle();
      if (!business.error) {
        const blocked = businessActionBlock(business.data?.business_verification_status, 'campaign');
        if (blocked) {
          return fail(null, blocked);
        }
      }
    }
    const imageUrl = input.imageUrl?.trim() || null;
    const category = isCampaignCategoryId(input.category) ? input.category : null;
    const description = input.description.trim();
    const payload = {
      title: input.title.trim(),
      platform: input.platform,
      budget: input.budget,
      description,
      status: input.status ?? 'active',
      is_blind: input.isBlind ?? false,
      author_id: authorId,
      author_name: input.authorName?.trim() || '',
      deadline: input.deadline,
      image_url: imageUrl,
      thumbnail_url: imageUrl,
      ...(category ? { category } : {}),
    };

    const markedDescription = category ? withCategoryMarker(description, category) : description;
    const attempts: { row: Record<string, unknown>; columns: string }[] = [
      { row: payload, columns: AUCTION_COLUMNS },
      {
        row: {
          title: payload.title,
          platform: payload.platform,
          budget: payload.budget,
          description: imageUrl ? withImageMarker(markedDescription, imageUrl) : markedDescription,
          status: payload.status,
          is_blind: payload.is_blind,
          author_id: payload.author_id,
          author_name: payload.author_name,
          deadline: payload.deadline,
          ...(category ? { category } : {}),
        },
        columns: AUCTION_COLUMNS_WITHOUT_IMAGES,
      },
      {
        row: {
          title: payload.title,
          platform: payload.platform,
          budget: payload.budget,
          description: markedDescription,
          status: payload.status,
          is_blind: payload.is_blind,
          author_id: payload.author_id,
          author_name: payload.author_name,
          deadline: payload.deadline,
          image_url: imageUrl,
          thumbnail_url: imageUrl,
        },
        columns: AUCTION_COLUMNS_WITHOUT_CATEGORY,
      },
      {
        row: {
          title: payload.title,
          platform: payload.platform,
          budget: payload.budget,
          description: imageUrl ? withImageMarker(markedDescription, imageUrl) : markedDescription,
          status: payload.status,
          is_blind: payload.is_blind,
          author_id: payload.author_id,
          author_name: payload.author_name,
          deadline: payload.deadline,
        },
        columns: AUCTION_COLUMNS_CORE,
      },
    ];

    let data: Partial<AuctionRow> & Pick<AuctionRow, 'id'> | null = null;
    let error: { message?: string; code?: string } | null = null;
    for (const attempt of attempts) {
      const result = await supabase
        .from('auctions')
        .insert(attempt.row as never)
        .select(attempt.columns)
        .single();
      data = result.data as typeof data;
      error = result.error;
      if (!error && data) {
        resolvedAuctionSelect = attempt.columns;
        break;
      }
      if (error && !isSchemaMismatch(error)) {
        break;
      }
      logDbError('경매 등록 컬럼 폴백', error);
    }

    if (error || !data) {
      logDbError('경매 등록', error);
      return fail(null, INSERT_FAIL_MESSAGE);
    }

    return ok(mapAuction(data));
  } catch (error) {
    logDbError('경매 등록 예외', error);
    return fail(null, INSERT_FAIL_MESSAGE);
  }
}

export async function createBid(
  input: CreateBidInput,
  options?: AuctionQueryOptions,
): Promise<DataResult<BidItem | null>> {
  const auctionId = input.auctionId.trim();
  const lockKey = `bid:${auctionId}:${(input.creatorId ?? '').trim() || input.creatorName.trim().toLowerCase()}`;
  return withExclusiveAction(lockKey, fail(null, VALIDATION.actionInFlight), async () => {
    const supabase = await resolveAuctionClient(options);
    const auctionResult = await getAuctionById(auctionId, {
      client: supabase ?? undefined,
    });
    const auction = auctionResult.data;
    if (!auction) {
      return fail(null, auctionResult.error ?? '해당 캠페인을 찾을 수 없습니다.');
    }

    const bidderId = (input.creatorId ?? '').trim();
    if (bidderId && isCampaignAuthor(auction, bidderId)) {
      return fail(null, VALIDATION.selfCampaignBid);
    }

    const bidError = validateBidPayload({
      bidAmount: input.bidAmount,
      proposalText: input.proposalText,
      creatorChannelUrl: input.creatorChannelUrl,
      auctionBudget: auction.budget,
      auctionStatus: auction.status,
      isBlind: auction.isBlind,
      winnerBidId: auction.winnerBidId,
      deadline: auction.deadline,
      creatorEmail: input.creatorEmail,
      bankAccount: input.bankAccount,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      accountHolder: input.accountHolder,
    });
    if (bidError) {
      return fail(null, bidError);
    }

    if (!supabase || !isUuid(auctionId)) {
      const mocked = await createMockBid({ ...input, auctionId });
      if (mocked.data) {
        void notifyLifecycleEvent({
          event: 'bid_received',
          auctionId: auction.id,
          auctionTitle: auction.title,
          toName: auction.authorName,
          toUserId: auction.authorId,
        });
      }
      return mocked;
    }

    try {
      const creatorId = await resolveAuthUserId(supabase, input.creatorId);
      if (!creatorId) {
        return fail(null, '제안을 등록하려면 로그인해 주세요.');
      }

      let existing = await supabase
        .from('bids')
        .select('id, creator_id, creator_name, status')
        .eq('auction_id', auctionId)
        .eq('creator_id', creatorId);
      if (existing.error && isSchemaMismatch(existing.error)) {
        existing = (await supabase
          .from('bids')
          .select('id, creator_id, creator_name')
          .eq('auction_id', auctionId)
          .eq('creator_id', creatorId)) as typeof existing;
      }
      if (existing.error) {
        logDbError('중복 제안 조회', existing.error);
      } else {
        const duplicated = (existing.data ?? []).some((row) => {
          if (row.creator_id !== creatorId) {
            return false;
          }
          const status = String(typeof row.status === 'string' ? row.status : 'pending');
          return status !== 'cancelled' && status !== 'rejected' && status !== 'withdrawn';
        });
        if (duplicated) {
          return fail(null, VALIDATION.duplicateBid);
        }
      }

      let { data, error } = await supabase
        .from('bids')
        .insert({
          auction_id: auctionId,
          creator_id: creatorId,
          creator_name: input.creatorName.trim(),
          creator_channel_url: input.creatorChannelUrl.trim(),
          bid_amount: input.bidAmount,
          proposal_text: sanitizeUserText(input.proposalText, 'reject'),
          status: 'pending',
          bank_name: (input.bankName ?? '').trim(),
          account_number: (input.accountNumber ?? '').replace(/\D/g, ''),
          account_holder: (input.accountHolder ?? '').trim(),
        })
        .select(BID_COLUMNS)
        .single();

      if (error && isSchemaMismatch(error)) {
        logDbError('입찰 등록 컬럼 폴백', error);
        const withoutSettlement = await supabase
          .from('bids')
          .insert({
            auction_id: auctionId,
            creator_id: creatorId,
            creator_name: input.creatorName.trim(),
            creator_channel_url: input.creatorChannelUrl.trim(),
            bid_amount: input.bidAmount,
            proposal_text: sanitizeUserText(input.proposalText, 'reject'),
            status: 'pending',
          })
          .select(BID_COLUMNS_CORE)
          .single();
        data = withoutSettlement.data as typeof data;
        error = withoutSettlement.error;
        if (error && isSchemaMismatch(error)) {
          const retry = await supabase
            .from('bids')
            .insert({
              auction_id: auctionId,
              creator_name: input.creatorName.trim(),
              creator_channel_url: input.creatorChannelUrl.trim(),
              bid_amount: input.bidAmount,
              proposal_text: sanitizeUserText(input.proposalText, 'reject'),
              status: 'pending',
            })
            .select(BID_COLUMNS_CORE)
            .single();
          data = retry.data as typeof data;
          error = retry.error;
        }
      }

      if (error || !data) {
        logDbError('입찰 등록', error);
        if (error?.message && /duplicate|unique/i.test(error.message)) {
          return fail(null, VALIDATION.duplicateBid);
        }
        return fail(null, INSERT_FAIL_MESSAGE);
      }

      const created = mapBid(data);
      void syncAuctionBidEngine(supabase, auctionId, created.bidAmount);
      void notifyLifecycleEvent({
        event: 'bid_received',
        auctionId: auction.id,
        auctionTitle: auction.title,
        toName: auction.authorName,
        toUserId: auction.authorId,
      });
      return ok(created);
    } catch (error) {
      if (error instanceof OffPlatformContactError) {
        return fail(null, error.message);
      }
      logDbError('입찰 등록 예외', error);
      return fail(null, INSERT_FAIL_MESSAGE);
    }
  });
}

export async function getBidsByCreator(
  userId: string,
  options?: { creatorName?: string; bidIds?: string[] },
): Promise<DataResult<BidItem[]>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockBidsByCreator(userId, options);
  }

  try {
    const creatorId = userId.trim();
    const creatorName = options?.creatorName?.trim() ?? '';
    const bidIds = uuidIds(options?.bidIds ?? []);
    if (!creatorId && !creatorName && bidIds.length === 0) {
      return fail([], '유효한 크리에이터 정보가 필요합니다.');
    }
    if (!isUuid(creatorId) && !creatorName && bidIds.length === 0) {
      return getMockBidsByCreator(userId, options);
    }

    const queries: PromiseLike<{
      data: unknown[] | null;
      error: { message?: string; code?: string } | null;
    }>[] = [];

    const selectBids = (columns: string) => {
      if (isUuid(creatorId)) {
        queries.push(
          supabase.from('bids').select(columns).eq('creator_id', creatorId).order('created_at', {
            ascending: false,
          }),
        );
      }
      if (creatorName) {
        queries.push(
          supabase.from('bids').select(columns).eq('creator_name', creatorName).order('created_at', {
            ascending: false,
          }),
        );
      }
      if (bidIds.length > 0) {
        queries.push(
          supabase.from('bids').select(columns).in('id', bidIds).order('created_at', {
            ascending: false,
          }),
        );
      }
    };

    selectBids(BID_COLUMNS);
    let results = await Promise.all(queries);
    const schemaError = results.find(
      (item) => item.error && isSchemaMismatch(item.error),
    );
    if (schemaError) {
      queries.length = 0;
      selectBids(BID_COLUMNS_CORE);
      results = await Promise.all(queries);
    }

    const merged: BidItem[] = [];
    const seen = new Set<string>();
    for (const result of results) {
      if (result.error) {
        logDbError('크리에이터 입찰 조회', result.error);
        continue;
      }
      for (const row of result.data ?? []) {
        const bid = mapBid(row as Partial<BidRow> & Pick<BidRow, 'id'>);
        if (!bid.id || seen.has(bid.id)) {
          continue;
        }
        seen.add(bid.id);
        merged.push(bid);
      }
    }

    merged.sort((left, right) => (right.createdAt || '').localeCompare(left.createdAt || ''));
    return ok(await withBidScores(merged));
  } catch (error) {
    logDbError('크리에이터 입찰 조회 예외', error);
    return fail([], '제안 목록을 불러오지 못했습니다.');
  }
}

export async function listAuctionsFromDatabase(
  client: SponsorAuctionClient,
): Promise<AuctionItem[]> {
  const pageSize = 1000;
  const rows: unknown[] = [];
  for (let from = 0; from < 10_000; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await withAuctionSelect((columns) =>
      client
        .from('auctions')
        .select(columns)
        .order('created_at', { ascending: false })
        .range(from, to),
    );
    if (error) {
      if (from === 0) {
        logDbError('관리자 캠페인 목록 조회', error);
        return [];
      }
      break;
    }
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) {
      break;
    }
  }
  return overlayPaidAuctions(client, rows.map((row) => mapAuction(row)));
}

export async function listBidsFromDatabase(
  client: SponsorAuctionClient,
): Promise<BidItem[]> {
  let { data, error } = await client
    .from('bids')
    .select(BID_COLUMNS)
    .order('created_at', { ascending: false });

  if (error && isSchemaMismatch(error)) {
    const fallback = await client
      .from('bids')
      .select(BID_COLUMNS_CORE)
      .order('created_at', { ascending: false });
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (error) {
    logDbError('관리자 입찰 목록 조회', error);
    return [];
  }

  return withBidScores((data ?? []).map((row) => mapBid(row)));
}

export async function getBids(): Promise<DataResult<BidItem[]>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockBids();
  }

  try {
    let { data, error } = await supabase
      .from('bids')
      .select(BID_COLUMNS)
      .order('created_at', { ascending: false });

    if (error && isSchemaMismatch(error)) {
      const fallback = await supabase
        .from('bids')
        .select(BID_COLUMNS_CORE)
        .order('created_at', { ascending: false });
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) {
      logDbError('입찰 목록 조회', error);
      return fail([], '제안 목록을 불러오지 못했습니다.');
    }

    const bids = (data ?? []).map((row) => mapBid(row));
    if (bids.length === 0) {
      return fail([], '등록된 제안이 없습니다.');
    }

    return ok(await withBidScores(bids));
  } catch (error) {
    logDbError('입찰 목록 조회 예외', error);
    return fail([], '제안 목록을 불러오지 못했습니다.');
  }
}

export async function deleteAuction(id: string): Promise<DataResult<boolean>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return deleteMockAuction(id);
  }

  try {
    if (!id.trim()) {
      return fail(false, '유효한 캠페인 ID가 필요합니다.');
    }
    if (!isUuid(id)) {
      return deleteMockAuction(id);
    }

    const { error } = await supabase.from('auctions').delete().eq('id', id);
    if (error) {
      logDbError('경매 삭제', error);
      return fail(false, UPDATE_FAIL_MESSAGE);
    }

    return ok(true);
  } catch (error) {
    logDbError('경매 삭제 예외', error);
    return fail(false, UPDATE_FAIL_MESSAGE);
  }
}

export async function updateAuctionStatus(
  id: string,
  status: AuctionStatus,
): Promise<DataResult<AuctionItem | null>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return updateMockAuctionStatus(id, status);
  }

  try {
    if (!id.trim()) {
      return fail(null, '유효한 캠페인 ID가 필요합니다.');
    }
    if (!isUuid(id)) {
      return updateMockAuctionStatus(id, status);
    }

    const { data, error } = await withAuctionSelect((columns) => {
      let query = supabase.from('auctions').update({ status }).eq('id', id);
      if (status === 'closed' || status === 'matched' || status === 'completed') {
        query = query.eq('status', 'active');
      }
      return query.select(columns).maybeSingle();
    });

    if (!error && !data) {
      return fail(null, VALIDATION.alreadyAwarded);
    }

    if (error || !data) {
      logDbError('경매 상태 변경', error);
      return fail(null, UPDATE_FAIL_MESSAGE);
    }

    return ok(mapAuction(data));
  } catch (error) {
    logDbError('경매 상태 변경 예외', error);
    return fail(null, UPDATE_FAIL_MESSAGE);
  }
}

export async function updateAuctionBlind(
  id: string,
  isBlind: boolean,
): Promise<DataResult<AuctionItem | null>> {
  return withExclusiveAction(`blind:${id}`, fail(null, VALIDATION.actionInFlight), async () => {
    const supabase = await getDataClient();
    if (!supabase) {
      return updateMockAuctionBlind(id, isBlind);
    }

    try {
      if (!id.trim()) {
        return fail(null, '유효한 캠페인 ID가 필요합니다.');
      }
      if (!isUuid(id)) {
        return updateMockAuctionBlind(id, isBlind);
      }

      const current = await getAuctionById(id);
      if (!current.data) {
        return fail(null, current.error ?? '해당 캠페인을 찾을 수 없습니다.');
      }
      if (current.data.isBlind === isBlind) {
        return fail(
          null,
          isBlind ? VALIDATION.blindAlready : VALIDATION.unblindAlready,
        );
      }

      const { data, error } = await withAuctionSelect((columns) =>
        supabase.from('auctions').update({ is_blind: isBlind }).eq('id', id).select(columns).maybeSingle(),
      );

      if (error && isSchemaMismatch(error)) {
        logDbError('블라인드 변경 컬럼 없음', error);
        return fail(
          null,
          'is_blind 컬럼이 없습니다. supabase/schema.sql을 기존 프로젝트에 실행해 주세요.',
        );
      }

      if (error || !data) {
        logDbError('블라인드 변경', error);
        return fail(null, UPDATE_FAIL_MESSAGE);
      }

      return ok(mapAuction(data));
    } catch (error) {
      logDbError('블라인드 변경 예외', error);
      return fail(null, UPDATE_FAIL_MESSAGE);
    }
  });
}

/** 광고주 본인 캠페인에 달린 제안만 조회합니다. 전체 제안 목록과 분리합니다. */
export async function getBidsByAuctionIds(
  auctionIds: string[],
  options?: AuctionQueryOptions,
): Promise<DataResult<BidItem[]>> {
  const unique = [...new Set(auctionIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) {
    return ok([]);
  }

  const supabase = await resolveAuctionClient(options);
  const uuids = uuidIds(unique);
  if (!supabase || uuids.length === 0) {
    return getMockBidsByAuctionIds(unique);
  }

  try {
    let { data, error } = await supabase
      .from('bids')
      .select(BID_COLUMNS)
      .in('auction_id', uuids)
      .order('created_at', { ascending: false });

    if (error && isSchemaMismatch(error)) {
      const fallback = await supabase
        .from('bids')
        .select(BID_COLUMNS_CORE)
        .in('auction_id', uuids)
        .order('created_at', { ascending: false });
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) {
      logDbError('캠페인 제안 조회', error);
      return fail([], '제안 목록을 불러오지 못했습니다.');
    }

    return ok(await withBidScores((data ?? []).map((row) => mapBid(row))));
  } catch (error) {
    logDbError('캠페인 제안 조회 예외', error);
    return fail([], '제안 목록을 불러오지 못했습니다.');
  }
}

export async function getBidsByAuctionId(
  auctionId: string,
): Promise<DataResult<BidItem[]>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockBidsByAuctionId(auctionId);
  }

  try {
    if (!auctionId.trim()) {
      return fail([], '유효한 캠페인 ID가 필요합니다.');
    }
    if (!isUuid(auctionId)) {
      return getMockBidsByAuctionId(auctionId);
    }

    let { data, error } = await supabase
      .from('bids')
      .select(BID_COLUMNS)
      .eq('auction_id', auctionId)
      .order('bid_amount', { ascending: true });

    if (error && isSchemaMismatch(error)) {
      const fallback = await supabase
        .from('bids')
        .select(BID_COLUMNS_CORE)
        .eq('auction_id', auctionId)
        .order('bid_amount', { ascending: true });
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) {
      logDbError('제안 목록 조회', error);
      return fail([], '제안 목록을 불러오지 못했습니다.');
    }

    return ok(await withBidScores((data ?? []).map((row) => mapBid(row))));
  } catch (error) {
    logDbError('제안 목록 조회 예외', error);
    return fail([], '제안 목록을 불러오지 못했습니다.');
  }
}

export async function awardBid(
  auctionId: string,
  bidId: string,
): Promise<DataResult<AuctionItem | null>> {
  return withExclusiveAction(
    `award:${auctionId}`,
    fail(null, VALIDATION.actionInFlight),
    async () => {
      const supabase = await getDataClient();
      if (!supabase || !isUuid(auctionId) || !isUuid(bidId)) {
        return awardMockBid(auctionId, bidId);
      }

      try {
        if (!auctionId.trim() || !bidId.trim()) {
          return fail(null, '유효한 캠페인/제안 ID가 필요합니다.');
        }

        const auctionResult = await getAuctionById(auctionId);
        if (!auctionResult.data) {
          return fail(null, auctionResult.error ?? '해당 캠페인을 찾을 수 없습니다.');
        }

        const awardBlocked = getAwardBlockReason(auctionResult.data);
        if (awardBlocked) {
          return fail(null, awardBlocked);
        }

        const rpc = await supabase.rpc('award_auction', {
          p_auction_id: auctionId,
          p_bid_id: bidId,
        });

        if (!rpc.error && rpc.data) {
          return ok(mapAuction(rpc.data));
        }

        if (rpc.error) {
          logDbError('낙찰 RPC', rpc.error);
          if (/이미 낙찰|not active|active 상태/i.test(rpc.error.message)) {
            return fail(null, VALIDATION.alreadyAwarded);
          }
          if (/찾을 수 없습니다/i.test(rpc.error.message)) {
            return fail(null, rpc.error.message);
          }
        }

        return await awardBidWithCheckAndSet(supabase, auctionId, bidId);
      } catch (error) {
        logDbError('낙찰 처리 예외', error);
        return fail(null, UPDATE_FAIL_MESSAGE);
      }
    },
  );
}

async function awardBidWithCheckAndSet(
  supabase: SponsorAuctionClient,
  auctionId: string,
  bidId: string,
): Promise<DataResult<AuctionItem | null>> {
  let bidQuery = await supabase
    .from('bids')
    .select(BID_COLUMNS)
    .eq('id', bidId)
    .eq('auction_id', auctionId)
    .maybeSingle();

  if (bidQuery.error && isSchemaMismatch(bidQuery.error)) {
    bidQuery = await supabase
      .from('bids')
      .select(BID_COLUMNS_CORE)
      .eq('id', bidId)
      .eq('auction_id', auctionId)
      .maybeSingle();
  }

  if (bidQuery.error || !bidQuery.data) {
    logDbError('낙찰 대상 조회', bidQuery.error);
    return fail(null, '해당 제안을 찾을 수 없습니다.');
  }

  const selectedUpdate = await supabase
    .from('bids')
    .update({ status: 'selected' })
    .eq('id', bidId)
    .eq('auction_id', auctionId)
    .eq('status', 'pending');

  if (selectedUpdate.error) {
    logDbError('제안 상태 변경', selectedUpdate.error);
    return fail(null, UPDATE_FAIL_MESSAGE);
  }

  let { data, error } = await withAuctionSelect((columns) =>
    supabase
      .from('auctions')
      .update({ status: 'closed', winner_bid_id: bidId })
      .eq('id', auctionId)
      .eq('status', 'active')
      .select(columns)
      .maybeSingle(),
  );

  if (error && isSchemaMismatch(error)) {
    const fallback = await withAuctionSelect((columns) =>
      supabase
        .from('auctions')
        .update({ status: 'closed' })
        .eq('id', auctionId)
        .eq('status', 'active')
        .select(columns)
        .maybeSingle(),
    );
    data = fallback.data as typeof data;
    error = fallback.error;
  }

  if (!error && !data) {
    return fail(null, VALIDATION.alreadyAwarded);
  }

  if (error || !data) {
    logDbError('낙찰 경매 갱신', error);
    return fail(null, UPDATE_FAIL_MESSAGE);
  }

  return ok({
    ...mapAuction(data),
    winnerBidId: bidId,
    status: 'closed',
  });
}

async function resolveAuthUserId(
  supabase: SponsorAuctionClient,
  explicitId?: string | null,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (!error && data.user?.id) {
      return data.user.id;
    }
    if (error) {
      logDbError('세션 사용자 조회', error);
    }
  } catch {
    // 세션이 없으면 호출자가 넘긴 데모 ID를 사용합니다.
  }

  return explicitId?.trim() || null;
}
