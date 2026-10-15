import {
  awardBid as awardMockBid,
  createAuction as createMockAuction,
  createBid as createMockBid,
  deleteAuction as deleteMockAuction,
  getAuctionById as getMockAuctionById,
  getAuctions as getMockAuctions,
  getBids as getMockBids,
  getBidsByAuctionId as getMockBidsByAuctionId,
  getBidsByCreator as getMockBidsByCreator,
  updateAuctionBlind as updateMockAuctionBlind,
  updateAuctionStatus as updateMockAuctionStatus,
} from '@/lib/mock-data';
import { withExclusiveAction } from '@/lib/action-lock';
import { type SponsorAuctionClient } from '@/lib/supabase';
import { getDataClient } from '@/lib/supabase/data-client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import {
  VALIDATION,
  getAwardBlockReason,
  validateAuctionPayload,
  validateBidPayload,
} from '@/lib/validation';
import type {
  AuctionItem,
  AuctionStatus,
  BidItem,
  BidStatus,
  CreateAuctionInput,
  CreateBidInput,
  DataResult,
  PlatformType,
} from '@/types/auction';
import type { Database } from '@/types/database';

export const INSERT_FAIL_MESSAGE = '등록에 실패했습니다. 다시 시도해 주세요.';
export const UPDATE_FAIL_MESSAGE = '변경에 실패했습니다. 다시 시도해 주세요.';

const AUCTION_COLUMNS =
  'id, title, platform, budget, description, status, is_blind, author_id, author_name, winner_bid_id, deadline, created_at, updated_at, bids_count';

const AUCTION_COLUMNS_CORE =
  'id, title, platform, budget, description, status, deadline, created_at, bids_count';

const BID_COLUMNS =
  'id, auction_id, creator_id, creator_name, creator_channel_url, bid_amount, proposal_text, status, created_at';

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

function mapAuction(row: Partial<AuctionRow> & Pick<AuctionRow, 'id'>): AuctionItem {
  return {
    id: row.id,
    title: row.title ?? '제목 없음',
    platform: (row.platform ?? 'other') as PlatformType,
    budget: row.budget ?? 0,
    description: row.description ?? '',
    status: (row.status ?? 'active') as AuctionStatus,
    isBlind: Boolean(row.is_blind),
    authorId: row.author_id ?? null,
    authorName: row.author_name?.trim() || '미상',
    winnerBidId: row.winner_bid_id ?? null,
    deadline: row.deadline ?? '',
    createdAt: row.created_at ?? '',
    bidsCount: row.bids_count ?? 0,
  };
}

function mapBid(row: Partial<BidRow> & Pick<BidRow, 'id'>): BidItem {
  return {
    id: row.id,
    auctionId: row.auction_id ?? '',
    creatorId: row.creator_id ?? null,
    creatorName: row.creator_name ?? '이름 없음',
    creatorChannelUrl: row.creator_channel_url ?? '',
    bidAmount: row.bid_amount ?? 0,
    proposalText: row.proposal_text ?? '',
    status: (row.status === 'selected' ? 'selected' : 'pending') as BidStatus,
    createdAt: row.created_at ?? '',
  };
}

function logDbError(action: string, error: unknown) {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error);
  console.error(`[SponsorAuction] ${action} 실패:`, detail, error);
}

export async function getAuctions(): Promise<DataResult<AuctionItem[]>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockAuctions();
  }

  const started = Date.now();
  try {
    let { data, error } = await supabase
      .from('auctions')
      .select(AUCTION_COLUMNS)
      .order('created_at', { ascending: false });

    if (error && isSchemaMismatch(error)) {
      logDbError('경매 목록 조회 컬럼 폴백', error);
      const fallback = await supabase
        .from('auctions')
        .select(AUCTION_COLUMNS_CORE)
        .order('created_at', { ascending: false });
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) {
      logDbError('경매 목록 조회', error);
      return getMockAuctions();
    }

    const auctions = (data ?? []).map((row) => mapAuction(row));
    if (auctions.length === 0) {
      return getMockAuctions();
    }

    return ok(auctions);
  } catch (error) {
    logDbError('경매 목록 조회 예외', error);
    return getMockAuctions();
  } finally {
    console.info(`[SponsorAuction] 경매 목록 조회 종료 (${Date.now() - started}ms)`);
  }
}

export async function getAuctionById(
  id: string,
): Promise<DataResult<AuctionItem | null>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockAuctionById(id);
  }

  const started = Date.now();
  try {
    if (!id.trim()) {
      return fail(null, '유효한 경매 ID가 필요합니다.');
    }

    let { data, error } = await supabase
      .from('auctions')
      .select(AUCTION_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (error && isSchemaMismatch(error)) {
      logDbError('경매 단건 조회 컬럼 폴백', error);
      const fallback = await supabase
        .from('auctions')
        .select(AUCTION_COLUMNS_CORE)
        .eq('id', id)
        .maybeSingle();
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) {
      logDbError('경매 단건 조회', error);
      return fail(null, '경매 정보를 불러오지 못했습니다.');
    }

    if (!data) {
      return getMockAuctionById(id);
    }

    return ok(mapAuction(data));
  } catch (error) {
    logDbError('경매 단건 조회 예외', error);
    return fail(null, '경매 정보를 불러오지 못했습니다.');
  } finally {
    console.info(`[SponsorAuction] 경매 단건 조회 종료 (${Date.now() - started}ms)`);
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

  const started = Date.now();
  try {
    const authorId = await resolveAuthUserId(supabase, input.authorId);
    const payload = {
      title: input.title.trim(),
      platform: input.platform,
      budget: input.budget,
      description: input.description.trim(),
      status: input.status ?? 'active',
      is_blind: input.isBlind ?? false,
      author_id: authorId,
      author_name: input.authorName?.trim() || '',
      deadline: input.deadline,
    };

    let { data, error } = await supabase
      .from('auctions')
      .insert(payload)
      .select(AUCTION_COLUMNS)
      .single();

    if (error && isSchemaMismatch(error)) {
      logDbError('경매 등록 컬럼 폴백', error);
      const retry = await supabase
        .from('auctions')
        .insert({
          title: payload.title,
          platform: payload.platform,
          budget: payload.budget,
          description: payload.description,
          status: payload.status,
          deadline: payload.deadline,
        })
        .select(AUCTION_COLUMNS_CORE)
        .single();
      data = retry.data as typeof data;
      error = retry.error;
    }

    if (error || !data) {
      logDbError('경매 등록', error);
      return fail(null, INSERT_FAIL_MESSAGE);
    }

    return ok(mapAuction(data));
  } catch (error) {
    logDbError('경매 등록 예외', error);
    return fail(null, INSERT_FAIL_MESSAGE);
  } finally {
    console.info(`[SponsorAuction] 경매 등록 종료 (${Date.now() - started}ms)`);
  }
}

export async function createBid(
  input: CreateBidInput,
): Promise<DataResult<BidItem | null>> {
  const lockKey = `bid:${input.auctionId}:${input.creatorName.trim().toLowerCase()}`;
  return withExclusiveAction(lockKey, fail(null, VALIDATION.actionInFlight), async () => {
    const supabase = await getDataClient();
    const auctionResult = await getAuctionById(input.auctionId);
    const auction = auctionResult.data;
    if (!auction) {
      return fail(null, auctionResult.error ?? '해당 경매를 찾을 수 없습니다.');
    }

    const bidError = validateBidPayload({
      bidAmount: input.bidAmount,
      proposalText: input.proposalText,
      creatorChannelUrl: input.creatorChannelUrl,
      auctionBudget: auction.budget,
      auctionStatus: auction.status,
      isBlind: auction.isBlind,
      winnerBidId: auction.winnerBidId,
    });
    if (bidError) {
      return fail(null, bidError);
    }

    if (!supabase) {
      return createMockBid(input);
    }

    const started = Date.now();
    try {
      const creatorId = await resolveAuthUserId(supabase, input.creatorId);

      let existing = await supabase
        .from('bids')
        .select('id, creator_id, creator_name')
        .eq('auction_id', input.auctionId);
      if (existing.error && isSchemaMismatch(existing.error)) {
        existing = (await supabase
          .from('bids')
          .select('id, creator_name')
          .eq('auction_id', input.auctionId)) as typeof existing;
      }
      if (existing.error) {
        logDbError('중복 제안 조회', existing.error);
      } else {
        const duplicated = (existing.data ?? []).some((row) => {
          if (creatorId && row.creator_id === creatorId) {
            return true;
          }
          return (
            typeof row.creator_name === 'string' &&
            row.creator_name.trim().toLowerCase() ===
              input.creatorName.trim().toLowerCase()
          );
        });
        if (duplicated) {
          return fail(null, VALIDATION.duplicateBid);
        }
      }

      let { data, error } = await supabase
        .from('bids')
        .insert({
          auction_id: input.auctionId,
          creator_id: creatorId,
          creator_name: input.creatorName.trim(),
          creator_channel_url: input.creatorChannelUrl.trim(),
          bid_amount: input.bidAmount,
          proposal_text: input.proposalText.trim(),
          status: 'pending',
        })
        .select(BID_COLUMNS)
        .single();

      if (error && isSchemaMismatch(error)) {
        logDbError('입찰 등록 컬럼 폴백', error);
        const retry = await supabase
          .from('bids')
          .insert({
            auction_id: input.auctionId,
            creator_name: input.creatorName.trim(),
            creator_channel_url: input.creatorChannelUrl.trim(),
            bid_amount: input.bidAmount,
            proposal_text: input.proposalText.trim(),
            status: 'pending',
          })
          .select(BID_COLUMNS_CORE)
          .single();
        data = retry.data as typeof data;
        error = retry.error;
      }

      if (error || !data) {
        logDbError('입찰 등록', error);
        if (error?.message && /duplicate|unique/i.test(error.message)) {
          return fail(null, VALIDATION.duplicateBid);
        }
        return fail(null, INSERT_FAIL_MESSAGE);
      }

      return ok(mapBid(data));
    } catch (error) {
      logDbError('입찰 등록 예외', error);
      return fail(null, INSERT_FAIL_MESSAGE);
    } finally {
      console.info(`[SponsorAuction] 입찰 등록 종료 (${Date.now() - started}ms)`);
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

  const started = Date.now();
  try {
    const creatorId = userId.trim();
    const creatorName = options?.creatorName?.trim() ?? '';
    const bidIds = (options?.bidIds ?? []).filter((id) => id.trim().length > 0);
    if (!creatorId && !creatorName && bidIds.length === 0) {
      return fail([], '유효한 크리에이터 정보가 필요합니다.');
    }

    const queries: PromiseLike<{
      data: unknown[] | null;
      error: { message?: string; code?: string } | null;
    }>[] = [];

    const selectBids = (columns: string) => {
      if (creatorId) {
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
    return ok(merged);
  } catch (error) {
    logDbError('크리에이터 입찰 조회 예외', error);
    return fail([], '제안 목록을 불러오지 못했습니다.');
  } finally {
    console.info(`[SponsorAuction] 크리에이터 입찰 조회 종료 (${Date.now() - started}ms)`);
  }
}

export async function getBids(): Promise<DataResult<BidItem[]>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockBids();
  }

  const started = Date.now();
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
      return fail([], '입찰 목록을 불러오지 못했습니다.');
    }

    const bids = (data ?? []).map((row) => mapBid(row));
    if (bids.length === 0) {
      return fail([], '등록된 입찰이 없습니다.');
    }

    return ok(bids);
  } catch (error) {
    logDbError('입찰 목록 조회 예외', error);
    return fail([], '입찰 목록을 불러오지 못했습니다.');
  } finally {
    console.info(`[SponsorAuction] 입찰 목록 조회 종료 (${Date.now() - started}ms)`);
  }
}

export async function deleteAuction(id: string): Promise<DataResult<boolean>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return deleteMockAuction(id);
  }

  const started = Date.now();
  try {
    if (!id.trim()) {
      return fail(false, '유효한 경매 ID가 필요합니다.');
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
  } finally {
    console.info(`[SponsorAuction] 경매 삭제 종료 (${Date.now() - started}ms)`);
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

  const started = Date.now();
  try {
    if (!id.trim()) {
      return fail(null, '유효한 경매 ID가 필요합니다.');
    }

    let query = supabase.from('auctions').update({ status }).eq('id', id);
    if (status === 'closed' || status === 'matched' || status === 'completed') {
      query = query.eq('status', 'active');
    }

    const { data, error } = await query.select(AUCTION_COLUMNS).maybeSingle();

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
  } finally {
    console.info(`[SponsorAuction] 경매 상태 변경 종료 (${Date.now() - started}ms)`);
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

    const started = Date.now();
    try {
      if (!id.trim()) {
        return fail(null, '유효한 경매 ID가 필요합니다.');
      }

      const current = await getAuctionById(id);
      if (!current.data) {
        return fail(null, current.error ?? '해당 경매를 찾을 수 없습니다.');
      }
      if (current.data.isBlind === isBlind) {
        return fail(
          null,
          isBlind ? VALIDATION.blindAlready : VALIDATION.unblindAlready,
        );
      }

      let { data, error } = await supabase
        .from('auctions')
        .update({ is_blind: isBlind })
        .eq('id', id)
        .select(AUCTION_COLUMNS)
        .maybeSingle();

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
    } finally {
      console.info(`[SponsorAuction] 블라인드 변경 종료 (${Date.now() - started}ms)`);
    }
  });
}

export async function getBidsByAuctionId(
  auctionId: string,
): Promise<DataResult<BidItem[]>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockBidsByAuctionId(auctionId);
  }

  const started = Date.now();
  try {
    if (!auctionId.trim()) {
      return fail([], '유효한 경매 ID가 필요합니다.');
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

    return ok((data ?? []).map((row) => mapBid(row)));
  } catch (error) {
    logDbError('제안 목록 조회 예외', error);
    return fail([], '제안 목록을 불러오지 못했습니다.');
  } finally {
    console.info(`[SponsorAuction] 제안 목록 조회 종료 (${Date.now() - started}ms)`);
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
      if (!supabase) {
        return awardMockBid(auctionId, bidId);
      }

      const started = Date.now();
      try {
        if (!auctionId.trim() || !bidId.trim()) {
          return fail(null, '유효한 경매/제안 ID가 필요합니다.');
        }

        const auctionResult = await getAuctionById(auctionId);
        if (!auctionResult.data) {
          return fail(null, auctionResult.error ?? '해당 경매를 찾을 수 없습니다.');
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
      } finally {
        console.info(`[SponsorAuction] 낙찰 처리 종료 (${Date.now() - started}ms)`);
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

  let { data, error } = await supabase
    .from('auctions')
    .update({ status: 'closed', winner_bid_id: bidId })
    .eq('id', auctionId)
    .eq('status', 'active')
    .select(AUCTION_COLUMNS)
    .maybeSingle();

  if (error && isSchemaMismatch(error)) {
    const fallback = await supabase
      .from('auctions')
      .update({ status: 'closed' })
      .eq('id', auctionId)
      .eq('status', 'active')
      .select(AUCTION_COLUMNS_CORE)
      .maybeSingle();
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
  if (explicitId?.trim()) {
    return explicitId.trim();
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      logDbError('세션 사용자 조회', error);
      return null;
    }
    return data.user?.id ?? null;
  } catch (error) {
    logDbError('세션 사용자 조회 예외', error);
    return null;
  }
}
