import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  businessNumberError,
  businessStatusNotice,
  formatBusinessNumber,
  formatOpeningDateInput,
  isBusinessVerificationStatus,
  normalizeBusinessNumber,
  normalizeOpeningDate,
  normalizeRepresentativeName,
  ntsBusinessLabelFromText,
  openingDateError,
  profileStatusFromNtsAndValidate,
  representativeNameError,
  type BusinessVerificationStatus,
} from '@/lib/business-registration';
import { lookupNtsBusinessStatus, validateNtsBusinessIdentity } from '@/lib/nts-business-status';
import { forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { hasAuthRole } from '@/types/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;
const BASE_COLUMNS =
  'business_registration_number, business_verification_status, business_status_detail, business_review_note, business_checked_at';
const EXTRA_COLUMNS = 'business_representative_name, business_opened_on';
const COLUMNS = `${BASE_COLUMNS}, ${EXTRA_COLUMNS}`;

type BusinessRow = {
  business_registration_number?: string | null;
  business_verification_status?: string | null;
  business_status_detail?: string | null;
  business_review_note?: string | null;
  business_representative_name?: string | null;
  business_opened_on?: string | null;
};

function present(row: BusinessRow) {
  const rawStatus = row.business_verification_status ?? '';
  const status: BusinessVerificationStatus = isBusinessVerificationStatus(rawStatus)
    ? rawStatus
    : 'unregistered';
  const detail = row.business_status_detail ?? '';
  return {
    businessNumber: formatBusinessNumber(row.business_registration_number ?? ''),
    representativeName: normalizeRepresentativeName(row.business_representative_name),
    openedOn: formatOpeningDateInput(row.business_opened_on),
    status,
    detail,
    reviewNote: row.business_review_note ?? '',
    notice: businessStatusNotice(status, detail),
    ntsLabel: ntsBusinessLabelFromText(detail),
  };
}

async function loadBusinessRow(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
) {
  const withExtra = await admin.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle();
  if (withExtra.error && isSchemaMismatch(withExtra.error)) {
    const basic = await admin.from('profiles').select(BASE_COLUMNS).eq('id', userId).maybeSingle();
    return { ...basic, extra: false as const };
  }
  return { ...withExtra, extra: true as const };
}

export async function GET(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('사업자 정보를 보려면 로그인해 주세요.');
    }
    if (
      !hasAuthRole(actor, 'advertiser') &&
      !hasAuthRole(actor, 'creator') &&
      !hasAuthRole(actor, 'admin')
    ) {
      return forbiddenJson('사업자등록번호는 광고주 또는 크리에이터 계정에서 관리합니다.');
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '사업자 정보를 불러올 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }
    const loaded = await loadBusinessRow(admin, actor.userId);
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
    if (
      !hasAuthRole(actor, 'advertiser') &&
      !hasAuthRole(actor, 'creator') &&
      !hasAuthRole(actor, 'admin')
    ) {
      return forbiddenJson('사업자등록번호는 광고주 또는 크리에이터 계정에서 관리합니다.');
    }
    const body = (await request.json().catch(() => null)) as {
      businessNumber?: unknown;
      representativeName?: unknown;
      openedOn?: unknown;
    } | null;
    const businessNumber = normalizeBusinessNumber(
      typeof body?.businessNumber === 'string' ? body.businessNumber : '',
    );
    const representativeName = normalizeRepresentativeName(
      typeof body?.representativeName === 'string' ? body.representativeName : '',
    );
    const openedOn = normalizeOpeningDate(typeof body?.openedOn === 'string' ? body.openedOn : '');
    if (businessNumber && businessNumberError(businessNumber)) {
      return NextResponse.json(
        { error: businessNumberError(businessNumber), errorCode: 'INVALID_NUMBER' },
        { status: 400, headers: NO_STORE },
      );
    }
    if (businessNumber) {
      const nameError = representativeNameError(representativeName);
      if (nameError) {
        return NextResponse.json(
          { error: nameError, errorCode: 'INVALID_REPRESENTATIVE' },
          { status: 400, headers: NO_STORE },
        );
      }
      const dateError = openingDateError(openedOn);
      if (dateError) {
        return NextResponse.json(
          { error: dateError, errorCode: 'INVALID_OPENING_DATE' },
          { status: 400, headers: NO_STORE },
        );
      }
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '사업자등록번호를 저장할 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    const current = await loadBusinessRow(admin, actor.userId);
    const currentRaw = current.data?.business_verification_status ?? '';
    const currentStatus: BusinessVerificationStatus = isBusinessVerificationStatus(currentRaw)
      ? currentRaw
      : 'unregistered';

    let status: BusinessVerificationStatus = businessNumber ? currentStatus : 'unregistered';
    let detail = businessNumber ? (current.data?.business_status_detail ?? '') : '';
    let lookupError: { code: string; message: string } | null = null;
    let ntsLabel = '';
    let mismatch = false;
    if (businessNumber) {
      const lookup = await lookupNtsBusinessStatus(businessNumber);
      const authenticity = await validateNtsBusinessIdentity({
        businessNumber,
        representativeName,
        openedOn,
      });
      if (authenticity.ok === false && (authenticity.code === 'INVALID_NUMBER' || authenticity.code === 'INVALID_INPUT')) {
        return NextResponse.json(
          { error: authenticity.message, errorCode: authenticity.code },
          { status: 400, headers: NO_STORE },
        );
      }
      if (lookup.ok && authenticity.ok) {
        const saved = profileStatusFromNtsAndValidate(
          lookup.code,
          lookup.label,
          authenticity.valid,
          authenticity.message,
        );
        status = saved.status;
        detail = saved.detail;
        ntsLabel = saved.ntsLabel;
        mismatch = saved.mismatch;
      } else if (!lookup.ok) {
        lookupError = { code: lookup.code, message: lookup.message };
        detail = lookup.message;
      } else if (!authenticity.ok) {
        lookupError = { code: authenticity.code, message: authenticity.message };
        detail = authenticity.message;
      }
    }

    const payload = {
      business_registration_number: businessNumber,
      business_verification_status: status,
      business_status_detail: detail,
      business_checked_at: new Date().toISOString(),
      business_representative_name: businessNumber ? representativeName : '',
      business_opened_on: businessNumber ? openedOn : '',
    };

    const updated = await admin
      .from('profiles')
      .update(payload)
      .eq('id', actor.userId)
      .select(COLUMNS)
      .maybeSingle();
    const savedRow =
      updated.error && isSchemaMismatch(updated.error)
        ? await admin
            .from('profiles')
            .update({
              business_registration_number: businessNumber,
              business_verification_status: status,
              business_status_detail: detail,
              business_checked_at: new Date().toISOString(),
            })
            .eq('id', actor.userId)
            .select(BASE_COLUMNS)
            .maybeSingle()
        : updated;

    if (savedRow.error && isSchemaMismatch(savedRow.error)) {
      return NextResponse.json(
        {
          error: '사업자등록번호 컬럼이 아직 없습니다. 마이그레이션을 적용해 주세요.',
          errorCode: 'SCHEMA_MISSING',
        },
        { status: 503, headers: NO_STORE },
      );
    }
    if (savedRow.error || !savedRow.data) {
      return NextResponse.json(
        { error: '사업자등록번호를 저장하지 못했습니다.', errorCode: 'SAVE_FAILED' },
        { status: 500, headers: NO_STORE },
      );
    }

    const row = savedRow.data as BusinessRow;
    const presented = {
      ...present({
        ...row,
        business_representative_name:
          row.business_representative_name ?? (businessNumber ? representativeName : ''),
        business_opened_on: row.business_opened_on ?? (businessNumber ? openedOn : ''),
      }),
      lookupError,
      mismatch,
      ntsLabel:
        ntsLabel ||
        ntsBusinessLabelFromText(row.business_status_detail) ||
        ntsBusinessLabelFromText(detail),
    };
    if (mismatch) {
      return NextResponse.json(
        {
          ...presented,
          error: detail,
          errorCode: 'MISMATCH',
        },
        { status: 409, headers: NO_STORE },
      );
    }
    if (lookupError && (lookupError.code === 'UNCONFIGURED' || lookupError.code === 'LOOKUP_FAILED')) {
      return NextResponse.json(
        {
          ...presented,
          error: lookupError.message,
          errorCode: lookupError.code,
        },
        { status: lookupError.code === 'UNCONFIGURED' ? 503 : 502, headers: NO_STORE },
      );
    }

    return NextResponse.json(presented, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '사업자등록번호를 저장하지 못했습니다.', errorCode: 'SAVE_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}
