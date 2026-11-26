import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  businessNumberError,
  formatBusinessNumber,
  formatOpeningDateInput,
  normalizeBusinessNumber,
  normalizeOpeningDate,
  normalizeRepresentativeName,
  openingDateError,
  representativeNameError,
} from '@/lib/business-registration';
import { validateNtsBusinessIdentity } from '@/lib/nts-business-status';
import { getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('사업자 진위확인을 하려면 로그인해 주세요.');
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
    const invalid =
      businessNumberError(businessNumber) ||
      representativeNameError(representativeName) ||
      openingDateError(openedOn);
    if (invalid) {
      const errorCode = businessNumberError(businessNumber)
        ? 'INVALID_NUMBER'
        : representativeNameError(representativeName)
          ? 'INVALID_REPRESENTATIVE'
          : 'INVALID_OPENING_DATE';
      return NextResponse.json({ error: invalid, errorCode }, { status: 400, headers: NO_STORE });
    }

    const lookup = await validateNtsBusinessIdentity({
      businessNumber,
      representativeName,
      openedOn,
    });
    if (!lookup.ok) {
      const status =
        lookup.code === 'INVALID_NUMBER' || lookup.code === 'INVALID_INPUT'
          ? 400
          : lookup.code === 'UNCONFIGURED'
            ? 503
            : 502;
      return NextResponse.json(
        {
          error: lookup.message,
          errorCode: lookup.code,
          businessNumber: formatBusinessNumber(businessNumber),
          representativeName,
          openedOn: formatOpeningDateInput(openedOn),
        },
        { status, headers: NO_STORE },
      );
    }

    if (!lookup.matched) {
      return NextResponse.json(
        {
          error: lookup.message,
          errorCode: 'MISMATCH',
          valid: lookup.valid,
          matched: false,
          businessNumber: formatBusinessNumber(lookup.businessNumber),
          representativeName,
          openedOn: formatOpeningDateInput(openedOn),
        },
        { status: 409, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        valid: lookup.valid,
        matched: true,
        message: lookup.message,
        businessNumber: formatBusinessNumber(lookup.businessNumber),
        representativeName,
        openedOn: formatOpeningDateInput(openedOn),
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '사업자 진위확인을 하지 못했습니다.', errorCode: 'LOOKUP_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}
