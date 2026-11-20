import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  businessNumberError,
  businessStatusNotice,
  formatBusinessNumber,
  isBusinessVerificationStatus,
  normalizeBusinessNumber,
  profileStatusFromNts,
  type BusinessVerificationStatus,
} from '@/lib/business-registration';
import { lookupNtsBusinessStatus } from '@/lib/nts-business-status';
import { getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;
const COLUMNS =
  'business_registration_number, business_verification_status, business_status_detail, business_review_note, business_checked_at';

function present(row: {
  business_registration_number?: string | null;
  business_verification_status?: string | null;
  business_status_detail?: string | null;
  business_review_note?: string | null;
}) {
  const rawStatus = row.business_verification_status ?? '';
  const status: BusinessVerificationStatus = isBusinessVerificationStatus(rawStatus)
    ? rawStatus
    : 'unregistered';
  const detail = row.business_status_detail ?? '';
  return {
    businessNumber: formatBusinessNumber(row.business_registration_number ?? ''),
    status,
    detail,
    reviewNote: row.business_review_note ?? '',
    notice: businessStatusNotice(status, detail),
  };
}

export async function GET(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('사업자 정보를 보려면 로그인해 주세요.');
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '사업자 정보를 불러올 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }
    const loaded = await admin.from('profiles').select(COLUMNS).eq('id', actor.userId).maybeSingle();
    if (loaded.error && isSchemaMismatch(loaded.error)) {
      return NextResponse.json(
        {
          ...present({}),
          error: '사업자등록번호 컬럼이 아직 없습니다. 마이그레이션을 적용해 주세요.',
          errorCode: 'SCHEMA_MISSING',
        },
        { status: 503, headers: NO_STORE },
      );
    }
    if (loaded.error) {
      return NextResponse.json(
        { error: '사업자 정보를 불러오지 못했습니다.', errorCode: 'LOOKUP_FAILED' },
        { status: 500, headers: NO_STORE },
      );
    }
    return NextResponse.json(present(loaded.data ?? {}), { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '사업자 정보를 불러오지 못했습니다.', errorCode: 'LOOKUP_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('사업자등록번호를 저장하려면 로그인해 주세요.');
    }
    const body = (await request.json().catch(() => null)) as { businessNumber?: unknown } | null;
    const businessNumber = normalizeBusinessNumber(
      typeof body?.businessNumber === 'string' ? body.businessNumber : '',
    );
    if (businessNumber && businessNumberError(businessNumber)) {
      return NextResponse.json(
        { error: businessNumberError(businessNumber), errorCode: 'INVALID_NUMBER' },
        { status: 400, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '사업자등록번호를 저장할 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    let status: BusinessVerificationStatus = businessNumber ? 'review_required' : 'unregistered';
    let detail = businessNumber
      ? '국세청 상태를 확인하기 전에 번호를 저장했습니다.'
      : '';
    let lookupError: { code: string; message: string } | null = null;
    if (businessNumber) {
      const lookup = await lookupNtsBusinessStatus(businessNumber);
      if (lookup.ok) {
        const saved = profileStatusFromNts(lookup.code, lookup.label);
        status = saved.status;
        detail = saved.detail;
      } else {
        lookupError = { code: lookup.code, message: lookup.message };
        detail = lookup.message;
        status = 'review_required';
      }
    }

    const updated = await admin
      .from('profiles')
      .update({
        business_registration_number: businessNumber,
        business_verification_status: status,
        business_status_detail: detail,
        business_checked_at: new Date().toISOString(),
      })
      .eq('id', actor.userId)
      .select(COLUMNS)
      .maybeSingle();
    if (updated.error && isSchemaMismatch(updated.error)) {
      return NextResponse.json(
        {
          error: '사업자등록번호 컬럼이 아직 없습니다. 마이그레이션을 적용해 주세요.',
          errorCode: 'SCHEMA_MISSING',
        },
        { status: 503, headers: NO_STORE },
      );
    }
    if (updated.error || !updated.data) {
      return NextResponse.json(
        { error: '사업자등록번호를 저장하지 못했습니다.', errorCode: 'SAVE_FAILED' },
        { status: 500, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        ...present(updated.data),
        lookupError,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '사업자등록번호를 저장하지 못했습니다.', errorCode: 'SAVE_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}
