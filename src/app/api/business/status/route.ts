import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  businessNumberError,
  formatBusinessNumber,
  normalizeBusinessNumber,
  profileStatusFromNts,
} from '@/lib/business-registration';
import { lookupNtsBusinessStatus } from '@/lib/nts-business-status';
import { getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('사업자 상태를 조회하려면 로그인해 주세요.');
    }

    const body = (await request.json().catch(() => null)) as { businessNumber?: unknown } | null;
    const businessNumber = normalizeBusinessNumber(
      typeof body?.businessNumber === 'string' ? body.businessNumber : '',
    );
    const invalid = businessNumberError(businessNumber);
    if (invalid) {
      return NextResponse.json(
        { error: invalid, errorCode: 'INVALID_NUMBER' },
        { status: 400, headers: NO_STORE },
      );
    }

    const lookup = await lookupNtsBusinessStatus(businessNumber);
    if (!lookup.ok) {
      return NextResponse.json(
        {
          error: lookup.message,
          errorCode: lookup.code,
          businessNumber: formatBusinessNumber(businessNumber),
        },
        { status: lookup.code === 'UNCONFIGURED' ? 503 : 502, headers: NO_STORE },
      );
    }

    const saved = profileStatusFromNts(lookup.code, lookup.label);
    return NextResponse.json(
      {
        businessNumber: formatBusinessNumber(lookup.businessNumber),
        ntsCode: lookup.code,
        ntsLabel: lookup.label,
        suggestedStatus: saved.status,
        detail: saved.detail,
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
