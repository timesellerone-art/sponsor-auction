import { showToast } from '@/components/Toast';
import {
  approvePayout as approveMockPayout,
  getAuctions as getMockAuctions,
  getBids as getMockBids,
  getPayouts as getMockPayouts,
  getProfiles as getMockProfiles,
  updatePayoutMemo as updateMockPayoutMemo,
  updateProfileStatus as updateMockProfileStatus,
} from '@/lib/mock-data';
import { withExclusiveAction } from '@/lib/action-lock';
import { mockGetSession } from '@/lib/auth-mock';
import { authRequestInit } from '@/lib/auth-request';
import { markPayoutPaid, updatePayoutMemo as persistPayoutMemo } from '@/lib/payouts';
import { getDataClient } from '@/lib/supabase/data-client';
import { RATE_LIMIT_MESSAGE } from '@/lib/rate-limit';
import { isUuid } from '@/lib/uuid';
import { VALIDATION } from '@/lib/validation';
import type {
  PayoutItem,
  ProfileItem,
  ProfileRole,
  ProfileStatus,
} from '@/types/admin';
import { isAuthProfileRole, parseAuthRoles, primaryAuthRole } from '@/types/auth';
import type { AuctionItem, BidItem, DataResult } from '@/types/auction';
import type { TimeSlotItem } from '@/types/timeslot';

export const ADMIN_UPDATE_FAIL_MESSAGE =
  '변경에 실패했습니다. 다시 시도해 주세요.';

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: ProfileRole | null;
  roles?: unknown;
  status: ProfileStatus;
  created_at: string;
};

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

function asAuctionItems(value: unknown): AuctionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is AuctionItem => {
    return Boolean(item && typeof item === 'object' && 'id' in item);
  });
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
  if (!row.id || !row.email || !isProfileStatus(row.status)) {
    return null;
  }
  if (row.role && !isProfileRole(row.role)) {
    return null;
  }

  const roles = parseAuthRoles(row.roles, row.role);
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: primaryAuthRole(roles) ?? row.role,
    roles,
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
      const next: ProfileItem[] = [];
      for (const row of payload.data) {
        const item = row as Partial<ProfileItem> & { created_at?: string };
        if (!item.id || !item.email || !item.status) {
          continue;
        }
        const mapped = mapProfile({
          id: item.id,
          name: item.name || item.email,
          email: item.email,
          role: item.role ?? null,
          roles: item.roles,
          status: item.status,
          created_at: item.createdAt || item.created_at || '',
        });
        if (!mapped) {
          continue;
        }
        next.push({
          ...mapped,
          businessRegistrationNumber: item.businessRegistrationNumber,
          businessVerificationStatus: item.businessVerificationStatus,
          businessStatusDetail: item.businessStatusDetail,
          businessReviewNote: item.businessReviewNote,
          businessRepresentativeName: item.businessRepresentativeName,
          businessOpenedOn: item.businessOpenedOn,
          businessCompanyName: item.businessCompanyName,
          businessAddress: item.businessAddress,
          businessContact: item.businessContact,
          businessCertificateName: item.businessCertificateName,
          hasBusinessCertificate: Boolean(item.hasBusinessCertificate || item.businessCertificateName),
          phone: item.phone ?? null,
          settlementType:
            item.settlementType === 'business' || item.settlementType === 'individual'
              ? item.settlementType
              : undefined,
        });
      }
      fromDb = next;
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

  return ok(fromDb);
}

async function parseAdminJson(response: Response, method: 'GET' | 'POST' | 'PATCH') {
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

  return updateMockProfileStatus(id, status);
  });
}

export async function getAdminAuctions(
  seedFromServer: AuctionItem[] = [],
): Promise<DataResult<AuctionItem[]>> {
  let fromDb: AuctionItem[] = asAuctionItems(seedFromServer);
  let apiOk = false;

  try {
    const response = await fetch('/api/admin/auctions', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    const payload = await parseAdminJson(response, 'GET');
    if (response.ok && Array.isArray(payload?.data)) {
      fromDb = asAuctionItems(payload.data);
      apiOk = true;
    } else if (!payload?.fallbackMock && response.status !== 409 && !response.ok && fromDb.length === 0) {
      return fail([], payload?.error || payload?.errorMessage || '캠페인 목록을 불러오지 못했습니다.');
    }
  } catch (error) {
    console.warn('[SponsorAuction] 캠페인 API 목록 조회 실패', error);
  }

  if (apiOk || fromDb.length > 0) {
    return ok(fromDb);
  }

  const mock = await mockGetSession();
  if (mock.data) {
    const mockResult = await getMockAuctions();
    const mockItems = asAuctionItems(mockResult.data);
    if (mockItems.length === 0) {
      return fail([], '등록된 캠페인이 없습니다.');
    }
    return ok(mockItems);
  }

  return fail([], '등록된 캠페인이 없습니다.');
}

function asTimeSlotItems(value: unknown): TimeSlotItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is TimeSlotItem => {
    return Boolean(item && typeof item === 'object' && 'id' in item && 'title' in item);
  });
}

export async function getAdminTimeslots(
  seedFromServer: TimeSlotItem[] = [],
): Promise<DataResult<TimeSlotItem[]>> {
  let fromDb: TimeSlotItem[] = asTimeSlotItems(seedFromServer);
  let apiOk = false;

  try {
    const response = await fetch('/api/admin/timeslots', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    const payload = await parseAdminJson(response, 'GET');
    if (response.ok && Array.isArray(payload?.data)) {
      fromDb = asTimeSlotItems(payload.data);
      apiOk = true;
    } else if (!payload?.fallbackMock && response.status !== 409 && !response.ok && fromDb.length === 0) {
      return fail(
        [],
        payload?.error || payload?.errorMessage || '크리에이터 상품 목록을 불러오지 못했습니다.',
      );
    }
  } catch (error) {
    console.warn('[SponsorAuction] 크리에이터 상품 API 목록 조회 실패', error);
  }

  if (apiOk || fromDb.length > 0) {
    return ok(fromDb);
  }

  return fail([], '등록된 크리에이터 상품이 없습니다.');
}

export async function patchAdminTimeslot(
  id: string,
  body: { isBlind?: boolean; status?: 'closed' },
): Promise<DataResult<TimeSlotItem | null>> {
  return withExclusiveAction(`timeslot:${id}`, fail(null, VALIDATION.actionInFlight), async () => {
    try {
      const response = await fetch(
        `/api/admin/timeslots/${encodeURIComponent(id)}`,
        await authRequestInit({
          method: 'PATCH',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-store' },
          body: JSON.stringify(body),
        }),
      );
      const payload = await parseAdminJson(response, 'PATCH');
      if (response.ok && payload?.data && typeof payload.data === 'object') {
        return ok(payload.data as TimeSlotItem);
      }
      return fail(null, payload?.error || payload?.errorMessage || ADMIN_UPDATE_FAIL_MESSAGE);
    } catch (error) {
      const message = error instanceof Error ? error.message : ADMIN_UPDATE_FAIL_MESSAGE;
      return fail(null, message);
    }
  });
}

export async function getAdminBids(seedFromServer: BidItem[] = []): Promise<DataResult<BidItem[]>> {
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
      return fail([], payload?.error || payload?.errorMessage || '제안 목록을 불러오지 못했습니다.');
    }
  } catch (error) {
    console.warn('[SponsorAuction] 입찰 API 목록 조회 실패', error);
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
      return fail([], '등록된 제안이 없습니다.');
    }
    return ok(list);
  }

  if (fromDb.length > 0) {
    return ok(fromDb);
  }

  return getMockBids();
}

export async function getPayouts(seedFromServer: PayoutItem[] = []): Promise<DataResult<PayoutItem[]>> {
  let fromDb: PayoutItem[] = asPayoutItems(seedFromServer);
  let apiOk = false;

  try {
    const response = await fetch('/api/admin/payouts', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-store' },
    });
    const payload = await parseAdminJson(response, 'GET');
    if (response.ok && Array.isArray(payload?.data)) {
      // 운영 DB 응답이 있으면 데모 세션보다 우선한다. 빈 배열도 실제 조회 결과로 본다.
      fromDb = asPayoutItems(payload.data);
      apiOk = true;
    } else if (!payload?.fallbackMock && response.status !== 409 && !response.ok && fromDb.length === 0) {
      return fail([], payload?.error || payload?.errorMessage || '정산 목록을 불러오지 못했습니다.');
    }
  } catch (error) {
    console.warn('[SponsorAuction] 정산 API 목록 조회 실패', error);
  }

  if (apiOk || fromDb.length > 0) {
    return ok(fromDb);
  }

  const mock = await mockGetSession();
  if (mock.data) {
    const mockResult = await getMockPayouts();
    const mockItems = asPayoutItems(mockResult.data);
    if (mockItems.length === 0) {
      return fail([], '정산 요청이 없습니다.');
    }
    return ok(mockItems);
  }

  return getMockPayouts();
}

async function useDemoAdminStore() {
  const mock = await mockGetSession();
  return Boolean(mock.data);
}

function isLivePayoutTarget(payout: PayoutItem | null, id: string) {
  if (isUuid(id) || id.startsWith('ord_')) {
    return true;
  }
  if (!payout) {
    return false;
  }
  if (isUuid(payout.id) || isUuid(payout.auctionId) || isUuid(payout.bidId)) {
    return true;
  }
  const order = (payout.paymentOrderId || '').trim();
  return order.startsWith('ord_');
}

function payoutApprovePayload(payout: PayoutItem | null, fallbackId: string) {
  const rowId = (payout?.id || fallbackId).trim();
  const paymentOrderId = (payout?.paymentOrderId || '').trim();
  return {
    id: rowId,
    paymentOrderId: paymentOrderId || (!isUuid(rowId) ? rowId : null),
    auctionId: payout?.auctionId ?? null,
    bidId: payout?.bidId ?? null,
    amount: payout?.amount,
    auctionTitle: payout?.auctionTitle,
    creatorName: payout?.creatorName,
    creatorEmail: payout?.creatorEmail,
    creatorId: payout?.creatorId,
  };
}

export async function approvePayout(
  target: string | PayoutItem,
): Promise<DataResult<PayoutItem | null>> {
  const payout = typeof target === 'string' ? null : target;
  const rowId = (payout?.id || (typeof target === 'string' ? target : '')).trim();
  const paymentOrderId = (payout?.paymentOrderId || '').trim();
  const id = paymentOrderId || rowId;
  const live = isLivePayoutTarget(payout, id);
  const payloadBody = payoutApprovePayload(payout, id);

  return withExclusiveAction(`payout:${id}`, fail(null, VALIDATION.actionInFlight), async () => {
  if (payout?.status === 'cancelled') {
    return fail(null, VALIDATION.payoutCancelled);
  }
  if (payout && (!payout.creatorEmail?.trim() || !payout.bankAccount?.trim())) {
    return fail(null, VALIDATION.payoutMissingContact);
  }
  if (!live && (await useDemoAdminStore())) {
    return approveMockPayout(payout ?? id);
  }

  try {
    const response = await fetch(
      '/api/admin/payouts',
      await authRequestInit({
        method: 'POST',
        body: JSON.stringify(payloadBody),
      }),
    );
    const payload = await parseAdminJson(response, 'POST');
    if (response.ok && payload?.data && typeof payload.data === 'object') {
      const mapped = payload.data as PayoutItem;
      if (mapped.id) {
        return ok({ ...mapped, status: 'paid' });
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
    if (!live) {
      return approveMockPayout(payout ?? id);
    }
    return fail(null, '해당 정산 요청을 저장할 수 없습니다.');
  }

  try {
    const result = await markPayoutPaid(supabase, payloadBody);
    if (!result.ok) {
      return fail(null, result.message);
    }
    return ok({ ...result.data, status: 'paid' });
  } catch (error) {
    const message = error instanceof Error ? error.message : ADMIN_UPDATE_FAIL_MESSAGE;
    console.error('[SponsorAuction] 정산 승인 예외:', error);
    return fail(null, message);
  }
  });
}

export async function savePayoutMemo(
  payout: PayoutItem,
  adminMemo: string,
): Promise<DataResult<PayoutItem | null>> {
  const id = (payout.paymentOrderId || payout.id).trim();
  const live = isLivePayoutTarget(payout, id);
  return withExclusiveAction(`payout-memo:${id}`, fail(null, VALIDATION.actionInFlight), async () => {
    if (!live && (await useDemoAdminStore())) {
      return updateMockPayoutMemo(payout.id, adminMemo);
    }

    try {
      const response = await fetch(
        '/api/admin/payouts/memo',
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({
            id: payout.id || id,
            paymentOrderId: payout.paymentOrderId ?? id,
            auctionId: payout.auctionId ?? null,
            bidId: payout.bidId ?? null,
            adminMemo,
          }),
        }),
      );
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
      if (!live) {
        return updateMockPayoutMemo(payout.id, adminMemo);
      }
      return fail(null, '정산 메모를 저장할 수 없습니다.');
    }

    try {
      const result = await persistPayoutMemo(supabase, {
        id: payout.id || id,
        paymentOrderId: payout.paymentOrderId ?? id,
        auctionId: payout.auctionId ?? null,
        bidId: payout.bidId ?? null,
        adminMemo,
      });
      if (!result.ok) {
        if (!live) {
          const mock = await updateMockPayoutMemo(payout.id, adminMemo);
          if (mock.data) {
            return ok(mock.data);
          }
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
