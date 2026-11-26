import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  formatBusinessNumber,
  formatOpeningDateInput,
  parseBusinessIdentityInput,
  profileStatusFromNts,
  profileStatusFromNtsAndValidate,
} from '@/lib/business-registration';
import { lookupNtsBusinessStatus, validateNtsBusinessIdentity } from '@/lib/nts-business-status';
import { getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('사업자 상태를 조회하려면 로그인해 주세요.');
    }

    const parsed = parseBusinessIdentityInput(
      (await request.json().catch(() => null)) as {
        businessNumber?: unknown;
        representativeName?: unknown;
        openedOn?: unknown;
      } | null,
    );
    if (parsed.error) {
      return NextResponse.json(
        { error: parsed.error, errorCode: parsed.errorCode },
        { status: 400, headers: NO_STORE },
      );
    }

    const authenticity = await validateNtsBusinessIdentity({
      businessNumber: parsed.businessNumber,
      representativeName: parsed.representativeName,
      openedOn: parsed.openedOn,
    });
    if (!authenticity.ok) {
      const status =
        authenticity.code === 'INVALID_NUMBER' || authenticity.code === 'INVALID_INPUT'
          ? 400
          : authenticity.code === 'UNCONFIGURED'
            ? 503
            : 502;
      return NextResponse.json(
        {
          error: authenticity.message,
          errorCode: authenticity.code,
          businessNumber: formatBusinessNumber(parsed.businessNumber),
          representativeName: parsed.representativeName,
          openedOn: formatOpeningDateInput(parsed.openedOn),
        },
        { status, headers: NO_STORE },
      );
    }
    if (!authenticity.matched) {
      const mismatched = profileStatusFromNtsAndValidate(
        '01',
        '계속사업자',
        authenticity.valid,
        authenticity.message,
      );
      return NextResponse.json(
        {
          error: authenticity.message,
          errorCode: 'MISMATCH',
          valid: authenticity.valid,
          matched: false,
          businessNumber: formatBusinessNumber(authenticity.businessNumber),
          representativeName: parsed.representativeName,
          openedOn: formatOpeningDateInput(parsed.openedOn),
          ntsLabel: mismatched.ntsLabel,
          suggestedStatus: mismatched.status,
          detail: mismatched.detail,
          status: mismatched.status,
        },
        { status: 409, headers: NO_STORE },
      );
    }

    const lookup = await lookupNtsBusinessStatus(parsed.businessNumber);
    if (!lookup.ok) {
      const status =
        lookup.code === 'INVALID_NUMBER' ? 400 : lookup.code === 'UNCONFIGURED' ? 503 : 502;
      return NextResponse.json(
        {
          error: lookup.message,
          errorCode: lookup.code,
          businessNumber: formatBusinessNumber(parsed.businessNumber),
        },
        { status, headers: NO_STORE },
      );
    }

    const saved = profileStatusFromNts(lookup.code, lookup.label);
    return NextResponse.json(
      {
        businessNumber: formatBusinessNumber(lookup.businessNumber),
        representativeName: parsed.representativeName,
        openedOn: formatOpeningDateInput(parsed.openedOn),
        ntsCode: lookup.code,
        ntsLabel: saved.ntsLabel || lookup.label,
        suggestedStatus: saved.status,
        detail: saved.detail,
        status: saved.status,
        valid: authenticity.valid,
        matched: true,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '사업자 상태를 조회하지 못했습니다.', errorCode: 'LOOKUP_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}
