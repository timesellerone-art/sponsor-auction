import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { listAndBackfillProfiles } from '@/lib/supabase/profile-sync';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import {
  formatBusinessNumber,
  isBusinessVerificationStatus,
} from '@/lib/business-registration';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET() {
  try {
    await connection();
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('회원 목록을 조회하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('회원 목록은 관리자만 볼 수 있습니다.');
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        {
          error: 'SUPABASE_SERVICE_ROLE_KEY가 없어 회원 목록을 DB에서 읽을 수 없습니다.',
          fallbackMock: true,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const { profiles, error } = await listAndBackfillProfiles(client);
    let business = await client
      .from('profiles')
      .select(
        'id, business_registration_number, business_verification_status, business_status_detail, business_review_note, settlement_type',
      );
    if (business.error) {
      business = await client
        .from('profiles')
        .select(
          'id, business_registration_number, business_verification_status, business_status_detail, business_review_note',
        );
    }
    const businessById = new Map(
      (business.error ? [] : business.data ?? []).map((row) => [row.id, row]),
    );
    const withBusiness = profiles.map((profile) => {
      const extra = businessById.get(profile.id);
      const status = isBusinessVerificationStatus(extra?.business_verification_status ?? '')
        ? extra?.business_verification_status
        : 'unregistered';
      const settlementType =
        extra && 'settlement_type' in extra && extra.settlement_type === 'business'
          ? 'business'
          : extra && 'settlement_type' in extra && extra.settlement_type === 'individual'
            ? 'individual'
            : undefined;
      return {
        ...profile,
        businessRegistrationNumber: formatBusinessNumber(extra?.business_registration_number ?? ''),
        businessVerificationStatus: status,
        businessStatusDetail: extra?.business_status_detail ?? '',
        businessReviewNote: extra?.business_review_note ?? '',
        settlementType,
      };
    });
    if (error && isSchemaMismatch({ message: error })) {
      return NextResponse.json({ fallbackMock: true }, { status: 409, headers: NO_STORE });
    }
    if (error && profiles.length === 0) {
      console.warn('[SponsorAuction] 관리자 회원 목록 조회 실패', error);
      return NextResponse.json(
        { error: '회원 목록을 불러오지 못했습니다.' },
        { status: 500, headers: NO_STORE },
      );
    }

    return NextResponse.json({ data: withBusiness }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    console.warn('[SponsorAuction] 관리자 회원 목록 API 예외', error);
    return NextResponse.json(
      { error: '회원 목록을 불러오지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
