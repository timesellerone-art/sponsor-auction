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
    type BusinessRow = {
      id: string;
      business_registration_number?: string | null;
      business_verification_status?: string | null;
      business_status_detail?: string | null;
      business_review_note?: string | null;
      settlement_type?: string | null;
      business_representative_name?: string | null;
      business_opened_on?: string | null;
      business_certificate_path?: string | null;
      business_certificate_name?: string | null;
    };
    let businessRows: BusinessRow[] = [];
    const full = await client
      .from('profiles')
      .select(
        'id, business_registration_number, business_verification_status, business_status_detail, business_review_note, settlement_type, business_representative_name, business_opened_on, business_certificate_path, business_certificate_name',
      );
    if (!full.error) {
      businessRows = (full.data ?? []) as BusinessRow[];
    } else {
      const withSettlement = await client
        .from('profiles')
        .select(
          'id, business_registration_number, business_verification_status, business_status_detail, business_review_note, settlement_type',
        );
      if (!withSettlement.error) {
        businessRows = (withSettlement.data ?? []) as BusinessRow[];
      } else {
        const basic = await client
          .from('profiles')
          .select(
            'id, business_registration_number, business_verification_status, business_status_detail, business_review_note',
          );
        if (!basic.error) {
          businessRows = (basic.data ?? []) as BusinessRow[];
        }
      }
    }
    const businessById = new Map(businessRows.map((row) => [row.id, row]));
    const withBusiness = profiles.map((profile) => {
      const extra = businessById.get(profile.id);
      const status = isBusinessVerificationStatus(extra?.business_verification_status ?? '')
        ? extra?.business_verification_status
        : 'unregistered';
      const settlementType =
        extra?.settlement_type === 'business' || extra?.settlement_type === 'individual'
          ? extra.settlement_type
          : undefined;
      return {
        ...profile,
        businessRegistrationNumber: formatBusinessNumber(extra?.business_registration_number ?? ''),
        businessVerificationStatus: status,
        businessStatusDetail: extra?.business_status_detail ?? '',
        businessReviewNote: extra?.business_review_note ?? '',
        businessRepresentativeName: extra?.business_representative_name?.trim() ?? '',
        businessOpenedOn: extra?.business_opened_on?.trim() ?? '',
        businessCertificateName: extra?.business_certificate_name?.trim() ?? '',
        hasBusinessCertificate: Boolean(extra?.business_certificate_path?.trim()),
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
