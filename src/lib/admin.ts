import { showToast } from '@/components/Toast';
import {
  approvePayout as approveMockPayout,
  getBids as getMockBids,
  getPayouts as getMockPayouts,
  getProfiles as getMockProfiles,
  updatePayoutMemo as updateMockPayoutMemo,
  updateProfileStatus as updateMockProfileStatus,
} from '@/lib/mock-data';
import { withExclusiveAction } from '@/lib/action-lock';
import { mockGetSession } from '@/lib/auth-mock';
import { markPayoutPaid, overlayDbPayoutStatus, updatePayoutMemo as persistPayoutMemo } from '@/lib/payouts';
import { getDataClient } from '@/lib/supabase/data-client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { VALIDATION } from '@/lib/validation';
import type {
  PayoutItem,
  ProfileItem,
  ProfileRole,
  ProfileStatus,
} from '@/types/admin';
import { isAuthProfileRole } from '@/types/auth';
import type { BidItem, DataResult } from '@/types/auction';

export const ADMIN_UPDATE_FAIL_MESSAGE =
  '변경에 실패했습니다. 다시 시도해 주세요.';

const PROFILE_COLUMNS = 'id, name, email, role, status, created_at';

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: ProfileRole | null;
  status: ProfileStatus;
  created_at: string;
};

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

function asBidItems(value: unknown): BidItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is BidItem => {
    return Boolean(item && typeof item === 'object' && 'id' in item && 'auctionId' in item);
  });
}

function asPayoutItems(value: unknown): PayoutItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is PayoutItem => {
    return Boolean(item && typeof item === 'object' && 'id' in item && 'status' in item);
  });
}

function isProfileRole(value: string): value is ProfileRole {
  return isAuthProfileRole(value);
}

function isProfileStatus(value: string): value is ProfileStatus {
  return value === 'active' || value === 'suspended';
}

function mapProfile(row: ProfileRow): ProfileItem | null {
  if (!row.role || !isProfileRole(row.role) || !isProfileStatus(row.status)) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
  };
}

function mergeProfiles(primary: ProfileItem[], secondary: ProfileItem[]) {
  const merged = new Map<string, ProfileItem>();
  for (const profile of secondary) {
    merged.set(profile.id, profile);
    merged.set(profile.email.trim().toLowerCase(), profile);
  }
  for (const profile of primary) {
    merged.set(profile.id, profile);
    merged.set(profile.email.trim().toLowerCase(), profile);
  }
  const unique = new Map<string, ProfileItem>();
  for (const profile of merged.values()) {
    unique.set(profile.id, profile);
  }
  return Array.from(unique.values()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export async function getProfiles(): Promise<DataResult<ProfileItem[]>> {
  let fromDb: ProfileItem[] = [];

  try {
    const response = await fetch('/api/admin/profiles', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    const payload = await parseAdminJson(response, 'GET');
    if (response.ok && Array.isArray(payload?.data)) {
      fromDb = payload.data
        .map((row) => {
          const item = row as Partial<ProfileItem> & { created_at?: string };
          if (!item.id || !item.email || !item.role || !item.status) {
            return null;
          }
          return mapProfile({
            id: item.id,
            name: item.name || item.email,
            email: item.email,
            role: item.role,
            status: item.status,
            created_at: item.createdAt || item.created_at || '',
          });
        })
        .filter((item): item is ProfileItem => item !== null);
    } else if (!payload?.fallbackMock && response.status !== 409 && !response.ok) {
      console.warn('[SponsorAuction] 회원 목록 API 조회 실패', payload?.error);
    }
  } catch (error) {
    console.warn('[SponsorAuction] 회원 목록 API 호출 실패', error);
  }

  const mock = await mockGetSession();
  if (mock.data) {
    const mockResult = await getMockProfiles();
    const list = mergeProfiles(fromDb, mockResult.data);
    if (list.length === 0) {
      return fail([], '등록된 회원이 없습니다.');
    }
    return ok(list);
  }

  if (fromDb.length > 0) {
    return ok(fromDb);
  }

  const supabase = await getDataClient();
  if (!supabase) {
    return getMockProfiles();
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .order('created_at', { ascending: false });

    if (error && isSchemaMismatch(error)) {
      return getMockProfiles();
    }
    if (error) {
      return fail([], '회원 목록을 불러오지 못했습니다.');
    }

    const profiles = (data ?? [])
      .map((row) => mapProfile(row as ProfileRow))
      .filter((item): item is ProfileItem => item !== null);
    if (profiles.length === 0) {
      return fail([], '등록된 회원이 없습니다.');
    }
    return ok(profiles);
  } catch {
    return fail([], '회원 목록을 불러오지 못했습니다.');
  }
}

async function parseAdminJson(response: Response, method: 'GET' | 'POST') {
  const payload = (await response.json().catch(() => null)) as {
    data?: unknown;
    error?: string;
    errorMessage?: string;
    fallbackMock?: boolean;
  } | null;
  if (response.status === 429 && method === 'GET') {
    showToast(payload?.errorMessage || payload?.error || RATE_LIMIT_MESSAGE);
  }
  return payload;
}

export async function updateProfileStatus(
  id: string,
  status: ProfileStatus,
): Promise<DataResult<ProfileItem | null>> {
  return withExclusiveAction(`profile:${id}`, fail(null, VALIDATION.actionInFlight), async () => {
  try {
    const response = await fetch('/api/admin/profiles/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    const payload = await parseAdminJson(response, 'POST');
    if (response.ok && payload?.data && typeof payload.data === 'object') {
      const row = payload.data as ProfileItem;
      if (row.id && row.status) {
        return ok(row);
      }
    }
    if (!payload?.fallbackMock && response.status !== 409 && !response.ok) {
      return fail(null, payload?.error ?? ADMIN_UPDATE_FAIL_MESSAGE);
    }
  } catch (error) {
    console.warn('[SponsorAuction] 회원 상태 API 호출 실패, Mock으로 저장합니다.', error);
  }

  const supabase = await getDataClient();
  if (!supabase) {
    return updateMockProfileStatus(id, status);
  }

  const started = Date.now();
  try {
    if (!id.trim()) {
      return fail(null, '유효한 회원 ID가 필요합니다.');
    }

    const current = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();
    if (current.error && isSchemaMismatch(current.error)) {
      return updateMockProfileStatus(id, status);
    }
    if (current.error || !current.data) {
      return fail(null, '해당 회원을 찾을 수 없습니다.');
    }
    const currentMapped = mapProfile(current.data as ProfileRow);
    if (currentMapped?.role === 'admin') {
      return fail(null, '관리자 계정은 제재할 수 없습니다.');
    }
    if (currentMapped?.status === status) {
      return fail(null, VALIDATION.sanctionAlready);
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ status })
      .eq('id', id)
      .neq('status', status)
      .select(PROFILE_COLUMNS)
      .maybeSingle();

    if (!error && !data) {
      return fail(null, VALIDATION.sanctionAlready);
    }

    if (error || !data) {
      console.error('[SponsorAuction] 회원 상태 변경 실패:', error?.message, error);
      return fail(null, ADMIN_UPDATE_FAIL_MESSAGE);
    }

    const mapped = mapProfile(data as ProfileRow);
    if (!mapped) {
      return fail(null, ADMIN_UPDATE_FAIL_MESSAGE);
    }

    return ok(mapped);
  } catch (error) {
    console.error('[SponsorAuction] 회원 상태 변경 예외:', error);
    return fail(null, ADMIN_UPDATE_FAIL_MESSAGE);
  } finally {
    console.info(`[SponsorAuction] 회원 상태 변경 종료 (${Date.now() - started}ms)`);
  }
  });
}

export async function getAdminBids(seedFromServer: BidItem[] = []): Promise<DataResult<BidItem[]>> {
  const started = Date.now();
  let fromDb: BidItem[] = asBidItems(seedFromServer);

  try {
    const response = await fetch('/api/admin/bids', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    const payload = await parseAdminJson(response, 'GET');
    if (response.ok && Array.isArray(payload?.data)) {
      fromDb = asBidItems(payload.data);
    } else if (!payload?.fallbackMock && response.status !== 409 && !response.ok && fromDb.length === 0) {
      return fail([], payload?.error || payload?.errorMessage || '입찰 목록을 불러오지 못했습니다.');
    }
  } catch (error) {
    console.warn('[SponsorAuction] 입찰 API 목록 조회 실패', error);
  } finally {
    console.info(`[SponsorAuction] 관리자 입찰 목록 조회 종료 (${Date.now() - started}ms)`);
  }

  const mock = await mockGetSession();
  if (mock.data) {
    const mockResult = await getMockBids();
    const merged = new Map<string, BidItem>();
    for (const bid of asBidItems(mockResult.data)) {
      merged.set(bid.id, bid);
    }
    for (const bid of fromDb) {
      merged.set(bid.id, bid);
    }
    const list = Array.from(merged.values());
    if (list.length === 0) {
      return fail([], '등록된 입찰이 없습니다.');
    }
    return ok(list);
  }

  if (fromDb.length > 0) {
    return ok(fromDb);
  }

  return getMockBids();
}

export async function getPayouts(seedFromServer: PayoutItem[] = []): Promise<DataResult<PayoutItem[]>> {
  const started = Date.now();
  let fromDb: PayoutItem[] = asPayoutItems(seedFromServer);

  try {
    const response = await fetch('/api/admin/payouts', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    const payload = await parseAdminJson(response, 'GET');
    if (response.ok && Array.isArray(payload?.data)) {
      fromDb = asPayoutItems(payload.data);
    } else if (!payload?.fallbackMock && response.status !== 409 && !response.ok && fromDb.length === 0) {
      return fail([], payload?.error || payload?.errorMessage || '정산 목록을 불러오지 못했습니다.');
    }
  } catch (error) {
    console.warn('[SponsorAuction] 정산 API 목록 조회 실패', error);
  } finally {
    console.info(`[SponsorAuction] 정산 목록 조회 종료 (${Date.now() - started}ms)`);
  }

  const mock = await mockGetSession();
  if (mock.data) {
    const mockResult = await getMockPayouts();
    const merged = overlayDbPayoutStatus(fromDb, asPayoutItems(mockResult.data));
    if (merged.length === 0) {
      return fail([], '정산 요청이 없습니다.');
    }
    return ok(merged);
  }

  if (fromDb.length > 0) {
    return ok(fromDb);
  }

  return getMockPayouts();
}

export async function approvePayout(
  target: string | PayoutItem,
): Promise<DataResult<PayoutItem | null>> {
  const payout = typeof target === 'string' ? null : target;
  const id =
    typeof target === 'string'
      ? target.trim()
      : (target.paymentOrderId || target.id).trim();

  return withExclusiveAction(`payout:${id}`, fail(null, VALIDATION.actionInFlight), async () => {
  try {
    const response = await fetch('/api/admin/payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id,
        paymentOrderId: payout?.paymentOrderId ?? id,
        auctionId: payout?.auctionId ?? null,
        bidId: payout?.bidId ?? null,
        amount: payout?.amount,
        auctionTitle: payout?.auctionTitle,
        creatorName: payout?.creatorName,
        creatorEmail: payout?.creatorEmail,
        creatorId: payout?.creatorId,
      }),
    });
    const payload = await parseAdminJson(response, 'POST');
    if (response.ok && payload?.data && typeof payload.data === 'object') {
      const mapped = payload.data as PayoutItem;
      if (mapped.id) {
        return ok(mapped);
      }
    }
    const apiError = payload?.error || payload?.errorMessage || `HTTP ${response.status}`;
    if (!payload?.fallbackMock || (response.status !== 409 && !response.ok)) {
      return fail(null, apiError);
    }
  } catch (error) {
    console.warn('[SponsorAuction] 정산 API 호출 실패, Mock으로 저장합니다.', error);
  }

  const supabase = await getDataClient();
  if (!supabase) {
    return approveMockPayout(id);
  }

  const started = Date.now();
  try {
    const result = await markPayoutPaid(supabase, {
      id,
      paymentOrderId: payout?.paymentOrderId ?? id,
      auctionId: payout?.auctionId ?? null,
      bidId: payout?.bidId ?? null,
      amount: payout?.amount,
      auctionTitle: payout?.auctionTitle,
      creatorName: payout?.creatorName,
      creatorEmail: payout?.creatorEmail,
      creatorId: payout?.creatorId,
    });
    if (!result.ok) {
      return fail(null, result.message);
    }
    return ok(result.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : ADMIN_UPDATE_FAIL_MESSAGE;
    console.error('[SponsorAuction] 정산 승인 예외:', error);
    return fail(null, message);
  } finally {
    console.info(`[SponsorAuction] 정산 승인 종료 (${Date.now() - started}ms)`);
  }
  });
}

export async function savePayoutMemo(
  payout: PayoutItem,
  adminMemo: string,
): Promise<DataResult<PayoutItem | null>> {
  const id = (payout.paymentOrderId || payout.id).trim();
  return withExclusiveAction(`payout-memo:${id}`, fail(null, VALIDATION.actionInFlight), async () => {
    try {
      const response = await fetch('/api/admin/payouts/memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          paymentOrderId: payout.paymentOrderId ?? id,
          auctionId: payout.auctionId ?? null,
          bidId: payout.bidId ?? null,
          adminMemo,
        }),
      });
      const payload = await parseAdminJson(response, 'POST');
      if (response.ok && payload?.data && typeof payload.data === 'object') {
        const mapped = payload.data as PayoutItem;
        if (mapped.id) {
          return ok({ ...payout, ...mapped, adminMemo });
        }
      }
      const apiError = payload?.error || payload?.errorMessage || `HTTP ${response.status}`;
      if (!payload?.fallbackMock && response.status !== 409 && !response.ok) {
        return fail(null, apiError);
      }
    } catch (error) {
      console.warn('[SponsorAuction] 정산 메모 API 호출 실패, Mock으로 저장합니다.', error);
    }

    const supabase = await getDataClient();
    if (!supabase) {
      return updateMockPayoutMemo(payout.id, adminMemo);
    }

    try {
      const result = await persistPayoutMemo(supabase, {
        id,
        paymentOrderId: payout.paymentOrderId ?? id,
        auctionId: payout.auctionId ?? null,
        bidId: payout.bidId ?? null,
        adminMemo,
      });
      if (!result.ok) {
        const mock = await updateMockPayoutMemo(payout.id, adminMemo);
        if (mock.data) {
          return ok(mock.data);
        }
        return fail(null, result.message);
      }
      return ok({ ...payout, ...result.data, adminMemo });
    } catch (error) {
      const message = error instanceof Error ? error.message : ADMIN_UPDATE_FAIL_MESSAGE;
      return fail(null, message);
    }
  });
}
