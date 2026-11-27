import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  businessStatusNotice,
  formatBusinessNumber,
  formatOpeningDateInput,
  isBusinessVerificationStatus,
  normalizeBusinessAddress,
  normalizeBusinessContact,
  normalizeBusinessNumber,
  normalizeCompanyName,
  normalizeRepresentativeName,
  ntsBusinessLabelFromText,
  parseBusinessDetailInput,
  parseBusinessIdentityInput,
  profileStatusFromNts,
  profileStatusFromNtsAndValidate,
  type BusinessVerificationStatus,
} from '@/lib/business-registration';
import { lookupNtsBusinessStatus, validateNtsBusinessIdentity } from '@/lib/nts-business-status';
import { forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { hasAuthRole } from '@/types/auth';
import type { Database } from '@/types/database';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

function failJson(message: string, errorCode: string, status: number) {
  return NextResponse.json(
    { error: message, errorCode, errorMessage: message },
    { status, headers: NO_STORE },
  );
}

function dbErrorMessage(error: { message?: string; code?: string } | null | undefined) {
  const code = error?.code?.trim();
  const message = error?.message?.trim();
  if (code && message) {
    return `${message} [${code}]`;
  }
  return message || code || '알 수 없는 오류';
}
const BASE_COLUMNS =
  'business_registration_number, business_verification_status, business_status_detail, business_review_note, business_checked_at';
const EXTRA_COLUMNS = 'business_representative_name, business_opened_on';
const CERT_COLUMNS = 'business_certificate_path, business_certificate_name';
const DETAIL_COLUMNS = 'business_company_name, business_address, business_contact';
const COLUMNS = `${BASE_COLUMNS}, ${EXTRA_COLUMNS}`;
const COLUMNS_WITH_CERT = `${COLUMNS}, ${CERT_COLUMNS}`;
const COLUMNS_FULL = `${COLUMNS_WITH_CERT}, ${DETAIL_COLUMNS}`;

type BusinessRow = {
  business_registration_number?: string | null;
  business_verification_status?: string | null;
  business_status_detail?: string | null;
  business_review_note?: string | null;
  business_representative_name?: string | null;
  business_opened_on?: string | null;
  business_certificate_path?: string | null;
  business_certificate_name?: string | null;
  business_company_name?: string | null;
  business_address?: string | null;
  business_contact?: string | null;
};

function present(row: BusinessRow) {
  const rawStatus = row.business_verification_status ?? '';
  const status: BusinessVerificationStatus = isBusinessVerificationStatus(rawStatus)
    ? rawStatus
    : 'unregistered';
  const detail = row.business_status_detail ?? '';
  const certificateName = row.business_certificate_name?.trim() ?? '';
  return {
    businessNumber: formatBusinessNumber(row.business_registration_number ?? ''),
    representativeName: normalizeRepresentativeName(row.business_representative_name),
    openedOn: formatOpeningDateInput(row.business_opened_on),
    companyName: normalizeCompanyName(row.business_company_name),
    address: normalizeBusinessAddress(row.business_address),
    contact: normalizeBusinessContact(row.business_contact),
    status,
    detail,
    reviewNote: row.business_review_note ?? '',
    notice: businessStatusNotice(status, detail),
    ntsLabel: ntsBusinessLabelFromText(detail),
    certificateName,
    hasCertificate: Boolean(row.business_certificate_path?.trim()),
  };
}

async function loadBusinessRow(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
) {
  const full = await admin.from('profiles').select(COLUMNS_FULL).eq('id', userId).maybeSingle();
  if (!full.error) {
    return { ...full, extra: true as const };
  }
  if (isSchemaMismatch(full.error)) {
    const withCert = await admin.from('profiles').select(COLUMNS_WITH_CERT).eq('id', userId).maybeSingle();
    if (!withCert.error) {
      return { ...withCert, extra: true as const };
    }
    if (isSchemaMismatch(withCert.error)) {
      const withExtra = await admin.from('profiles').select(COLUMNS).eq('id', userId).maybeSingle();
      if (!withExtra.error) {
        return { ...withExtra, extra: true as const };
      }
      if (isSchemaMismatch(withExtra.error)) {
        const basic = await admin.from('profiles').select(BASE_COLUMNS).eq('id', userId).maybeSingle();
        return { ...basic, extra: false as const };
      }
      return { ...withExtra, extra: false as const };
    }
    return { ...withCert, extra: true as const };
  }
  return { ...full, extra: true as const };
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
    const userId = actor.userId;
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
      companyName?: unknown;
      address?: unknown;
      contact?: unknown;
    } | null;
    if (!body) {
      return failJson('요청 본문이 올바르지 않습니다.', 'INVALID_INPUT', 400);
    }
    const parsed = parseBusinessIdentityInput(body);
    const details = parseBusinessDetailInput(body);
    const clearing =
      !parsed.businessNumber &&
      !parsed.representativeName &&
      !parsed.openedOn &&
      !details.companyName &&
      !details.address &&
      !details.contact;
    if (!clearing && parsed.error) {
      return failJson(parsed.error, parsed.errorCode || 'INVALID_INPUT', 400);
    }
    const businessNumber = clearing ? '' : parsed.businessNumber;
    const representativeName = clearing ? '' : parsed.representativeName;
    const openedOn = clearing ? '' : parsed.openedOn;
    const companyName = clearing ? '' : details.companyName;
    const address = clearing ? '' : details.address;
    const contact = clearing ? '' : details.contact;

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '사업자등록번호를 저장할 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    let status: BusinessVerificationStatus = 'unregistered';
    let detail = '';
    let ntsLabel = '';
    let mismatch = false;
    if (businessNumber) {
      const authenticity = await validateNtsBusinessIdentity({
        businessNumber,
        representativeName,
        openedOn,
      });
      if (!authenticity.ok) {
        const httpStatus =
          authenticity.code === 'INVALID_NUMBER' || authenticity.code === 'INVALID_INPUT'
            ? 400
            : authenticity.code === 'UNCONFIGURED'
              ? 503
              : 502;
        return NextResponse.json(
          { error: authenticity.message, errorCode: authenticity.code },
          { status: httpStatus, headers: NO_STORE },
        );
      }
      if (!authenticity.matched) {
        const saved = profileStatusFromNtsAndValidate(
          '01',
          '계속사업자',
          authenticity.valid,
          authenticity.message,
        );
        status = saved.status;
        detail = saved.detail;
        ntsLabel = saved.ntsLabel;
        mismatch = true;
      } else {
        const lookup = await lookupNtsBusinessStatus(businessNumber);
        if (!lookup.ok) {
          return NextResponse.json(
            { error: lookup.message, errorCode: lookup.code },
            {
              status: lookup.code === 'INVALID_NUMBER' ? 400 : lookup.code === 'UNCONFIGURED' ? 503 : 502,
              headers: NO_STORE,
            },
          );
        }
        const saved = profileStatusFromNts(lookup.code, lookup.label);
        status = saved.status;
        detail = saved.detail;
        ntsLabel = saved.ntsLabel;
      }
    }

    const cert = await admin
      .from('profiles')
      .select('business_certificate_path, business_certificate_name')
      .eq('id', userId)
      .maybeSingle();
    const certPath =
      !cert.error && typeof cert.data?.business_certificate_path === 'string'
        ? cert.data.business_certificate_path.trim()
        : '';
    const certName =
      !cert.error && typeof cert.data?.business_certificate_name === 'string'
        ? cert.data.business_certificate_name.trim()
        : '';
    if (!clearing && businessNumber && !mismatch && status !== 'closed') {
      if (details.error) {
        return failJson(details.error, details.errorCode ?? 'INVALID_INPUT', 400);
      }
      if (!cert.error && !certPath) {
        return failJson(
          '사업자등록증 사본을 첨부한 뒤 저장해 주세요.',
          'CERTIFICATE_REQUIRED',
          400,
        );
      }
    }

    const basePayload = {
      business_registration_number: businessNumber,
      business_verification_status: status,
      business_status_detail: detail,
      business_checked_at: new Date().toISOString(),
    };
    const extraPayload = {
      ...basePayload,
      business_representative_name: businessNumber ? representativeName : '',
      business_opened_on: businessNumber ? openedOn : '',
    };
    const certPayload = cert.error
      ? extraPayload
      : {
          ...extraPayload,
          business_certificate_path: certPath,
          business_certificate_name: certName,
        };
    const fullPayload = {
      ...certPayload,
      business_company_name: businessNumber ? companyName : '',
      business_address: businessNumber ? address : '',
      business_contact: businessNumber ? contact : '',
    };

    type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
    const applyUpdate = (payload: ProfileUpdate) =>
      admin.from('profiles').update(payload).eq('id', userId);

    let updated = await applyUpdate(fullPayload);
    if (updated.error && isSchemaMismatch(updated.error)) {
      const missingDetail = dbErrorMessage(updated.error);
      const withCert = await applyUpdate(certPayload);
      if (!withCert.error) {
        return failJson(
          `상호명·사업장 주소·사업자 연락처 컬럼이 없어 저장하지 못했습니다. (${missingDetail}) supabase/migrations/20261127_business_profile_details.sql 을 적용해 주세요.`,
          'SCHEMA_MISSING',
          503,
        );
      }
      if (!isSchemaMismatch(withCert.error)) {
        updated = withCert;
      } else {
        const withExtra = await applyUpdate(extraPayload);
        if (!withExtra.error) {
          return failJson(
            `사업자 정보 일부 컬럼이 없어 전체 항목을 저장하지 못했습니다. (${missingDetail}) 마이그레이션을 적용해 주세요.`,
            'SCHEMA_MISSING',
            503,
          );
        }
        if (!isSchemaMismatch(withExtra.error)) {
          updated = withExtra;
        } else {
          updated = await applyUpdate(basePayload);
          if (!updated.error) {
            return failJson(
              `사업자 정보 일부 컬럼이 없어 전체 항목을 저장하지 못했습니다. (${missingDetail}) 마이그레이션을 적용해 주세요.`,
              'SCHEMA_MISSING',
              503,
            );
          }
          if (isSchemaMismatch(updated.error)) {
            return failJson(
              `사업자 정보 컬럼이 없어 저장하지 못했습니다. (${dbErrorMessage(updated.error)}) 마이그레이션을 적용해 주세요.`,
              'SCHEMA_MISSING',
              503,
            );
          }
        }
      }
    }

    if (updated.error) {
      console.warn('[SponsorAuction] 사업자 정보 저장 실패', updated.error);
      return failJson(
        `사업자 정보를 저장하지 못했습니다: ${dbErrorMessage(updated.error)}`,
        'SAVE_FAILED',
        500,
      );
    }

    const loaded = await loadBusinessRow(admin, userId);
    if (loaded.error || !loaded.data) {
      return failJson(
        '사업자 정보는 저장되었지만 다시 읽지 못했습니다. 페이지를 새로고침해 주세요.',
        'LOOKUP_FAILED',
        500,
      );
    }
    const row = loaded.data as BusinessRow;
    const persistedIncomplete = Boolean(
      businessNumber &&
        (normalizeBusinessNumber(row.business_registration_number) !== businessNumber ||
          (representativeName &&
            normalizeRepresentativeName(row.business_representative_name) !== representativeName) ||
          (openedOn && formatOpeningDateInput(row.business_opened_on) !== formatOpeningDateInput(openedOn)) ||
          (companyName && normalizeCompanyName(row.business_company_name) !== companyName) ||
          (address && normalizeBusinessAddress(row.business_address) !== address) ||
          (contact && normalizeBusinessContact(row.business_contact) !== contact)),
    );
    if (persistedIncomplete) {
      return failJson(
        '상호명·대표자 성명·사업자등록번호·개업일자·주소·연락처가 DB에 반영되지 않았습니다. 마이그레이션을 적용한 뒤 다시 저장해 주세요.',
        'SCHEMA_MISSING',
        503,
      );
    }
    const presented = {
      ...present(row),
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
          errorMessage: detail,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    return NextResponse.json(presented, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    return failJson('사업자등록번호를 저장하지 못했습니다.', 'SAVE_FAILED', 500);
  }
}
