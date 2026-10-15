import {
  approvePayout as approveMockPayout,
  getPayouts as getMockPayouts,
  getProfiles as getMockProfiles,
  updateProfileStatus as updateMockProfileStatus,
} from '@/lib/mock-data';
import { withExclusiveAction } from '@/lib/action-lock';
import { listPayoutsFromDatabase, mapPayout, PAYOUT_COLUMNS } from '@/lib/payouts';
import { getDataClient } from '@/lib/supabase/data-client';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { VALIDATION } from '@/lib/validation';
import type {
  PayoutItem,
  ProfileItem,
  ProfileRole,
  ProfileStatus,
} from '@/types/admin';
import { isAuthProfileRole } from '@/types/auth';
import type { DataResult } from '@/types/auction';
import type { Database } from '@/types/database';

export const ADMIN_UPDATE_FAIL_MESSAGE =
  '변경에 실패했습니다. 다시 시도해 주세요.';

const PROFILE_COLUMNS = 'id, name, email, role, status, created_at';

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: ProfileRole;
  status: ProfileStatus;
  created_at: string;
};

type PayoutRow = Database['public']['Tables']['payouts']['Row'];

function fail<T>(data: T, error: string): DataResult<T> {
  return { data, error };
}

function ok<T>(data: T): DataResult<T> {
  return { data, error: null };
}

function isProfileRole(value: string): value is ProfileRole {
  return isAuthProfileRole(value);
}

function isProfileStatus(value: string): value is ProfileStatus {
  return value === 'active' || value === 'suspended';
}

function mapProfile(row: ProfileRow): ProfileItem | null {
  if (!isProfileRole(row.role) || !isProfileStatus(row.status)) {
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

export async function getProfiles(): Promise<DataResult<ProfileItem[]>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockProfiles();
  }

  const started = Date.now();
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .order('created_at', { ascending: false });

    if (error && isSchemaMismatch(error)) {
      console.warn('[SponsorAuction] profiles 테이블이 없어 Mock으로 전환합니다.', error.message);
      return getMockProfiles();
    }

    if (error) {
      console.error('[SponsorAuction] 회원 목록 조회 실패:', error.message, error);
      return fail([], '회원 목록을 불러오지 못했습니다.');
    }

    const profiles = (data ?? [])
      .map((row) => mapProfile(row as ProfileRow))
      .filter((item): item is ProfileItem => item !== null);

    if (profiles.length === 0) {
      return fail([], '등록된 회원이 없습니다.');
    }

    return ok(profiles);
  } catch (error) {
    console.error('[SponsorAuction] 회원 목록 조회 예외:', error);
    return fail([], '회원 목록을 불러오지 못했습니다.');
  } finally {
    console.info(`[SponsorAuction] 회원 목록 조회 종료 (${Date.now() - started}ms)`);
  }
}

export async function updateProfileStatus(
  id: string,
  status: ProfileStatus,
): Promise<DataResult<ProfileItem | null>> {
  return withExclusiveAction(`profile:${id}`, fail(null, VALIDATION.actionInFlight), async () => {
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

export async function getPayouts(): Promise<DataResult<PayoutItem[]>> {
  const supabase = await getDataClient();
  if (!supabase) {
    return getMockPayouts();
  }

  const started = Date.now();
  try {
    const payouts = await listPayoutsFromDatabase(supabase);

    if (payouts.length === 0) {
      return fail([], '정산 요청이 없습니다.');
    }

    return ok(payouts);
  } catch (error) {
    if (error && typeof error === 'object' && 'message' in error) {
      const message = String((error as { message?: string }).message ?? '');
      if (isSchemaMismatch({ message, code: (error as { code?: string }).code })) {
        console.warn('[SponsorAuction] payouts 테이블이 없어 Mock으로 전환합니다.', message);
        return getMockPayouts();
      }
    }
    console.error('[SponsorAuction] 정산 목록 조회 예외:', error);
    return fail([], '정산 목록을 불러오지 못했습니다.');
  } finally {
    console.info(`[SponsorAuction] 정산 목록 조회 종료 (${Date.now() - started}ms)`);
  }
}

export async function approvePayout(
  id: string,
): Promise<DataResult<PayoutItem | null>> {
  return withExclusiveAction(`payout:${id}`, fail(null, VALIDATION.actionInFlight), async () => {
  const supabase = await getDataClient();
  if (!supabase) {
    return approveMockPayout(id);
  }

  const started = Date.now();
  try {
    const target = id.trim();
    if (!target) {
      return fail(null, '유효한 정산 ID가 필요합니다.');
    }

    const auctionId = target.startsWith('auction:') ? target.slice('auction:'.length) : target;
    const attempts: Array<{ column: 'id' | 'payment_order_id' | 'auction_id'; value: string }> = [
      { column: 'id', value: target },
      { column: 'payment_order_id', value: target },
      { column: 'auction_id', value: auctionId },
    ];

    for (const attempt of attempts) {
      const { data, error } = await supabase
        .from('payouts')
        .update({ status: 'paid' })
        .eq(attempt.column, attempt.value)
        .eq('status', 'pending')
        .select(PAYOUT_COLUMNS)
        .maybeSingle();

      if (error && isSchemaMismatch(error) && attempt.column !== 'id') {
        continue;
      }
      if (error) {
        console.error('[SponsorAuction] 정산 승인 실패:', error.message, error);
        return fail(null, ADMIN_UPDATE_FAIL_MESSAGE);
      }
      if (data) {
        const mapped = mapPayout(data as PayoutRow);
        if (!mapped) {
          return fail(null, ADMIN_UPDATE_FAIL_MESSAGE);
        }
        return ok(mapped);
      }
    }

    return fail(null, VALIDATION.payoutAlready);
  } catch (error) {
    console.error('[SponsorAuction] 정산 승인 예외:', error);
    return fail(null, ADMIN_UPDATE_FAIL_MESSAGE);
  } finally {
    console.info(`[SponsorAuction] 정산 승인 종료 (${Date.now() - started}ms)`);
  }
  });
}
