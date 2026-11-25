import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { getPaymentActor, unauthorizedJson, forbiddenJson } from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import {
  creatorSettlementError,
  creatorSettlementFromRow,
  parseSettlementType,
  settlementAccountFromParts,
  type CreatorSettlementProfile,
} from '@/lib/settlement-account';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;
const COLUMNS = 'bank_name, account_number, account_holder, settlement_type';

function present(row: {
  bank_name?: string | null;
  account_number?: string | null;
  account_holder?: string | null;
  settlement_type?: string | null;
}): CreatorSettlementProfile {
  return creatorSettlementFromRow(row);
}

function schemaMissing() {
  return NextResponse.json(
    {
      ...present({}),
      error: '정산 계좌 컬럼이 아직 없습니다. 마이그레이션을 적용해 주세요.',
      errorCode: 'SCHEMA_MISSING',
    },
    { status: 503, headers: NO_STORE },
  );
}

export async function GET(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('정산 계좌를 보려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'creator') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('정산 계좌는 크리에이터 계정에서 확인할 수 있습니다.');
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '정산 계좌를 불러올 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }
    const loaded = await admin.from('profiles').select(COLUMNS).eq('id', actor.userId).maybeSingle();
    if (loaded.error && isSchemaMismatch(loaded.error)) {
      return schemaMissing();
    }
    if (loaded.error) {
      return NextResponse.json(
        { error: '정산 계좌를 불러오지 못했습니다.', errorCode: 'LOOKUP_FAILED' },
        { status: 500, headers: NO_STORE },
      );
    }
    return NextResponse.json(present(loaded.data ?? {}), { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '정산 계좌를 불러오지 못했습니다.', errorCode: 'LOOKUP_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('정산 계좌를 저장하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'creator') && !hasAuthRole(actor, 'admin')) {
      return forbiddenJson('정산 계좌는 크리에이터 계정에서 저장할 수 있습니다.');
    }

    const body = (await request.json().catch(() => null)) as {
      bankName?: unknown;
      accountNumber?: unknown;
      accountHolder?: unknown;
      settlementType?: unknown;
    } | null;
    const profile: CreatorSettlementProfile = {
      ...settlementAccountFromParts({
        bankName: typeof body?.bankName === 'string' ? body.bankName : '',
        accountNumber: typeof body?.accountNumber === 'string' ? body.accountNumber : '',
        accountHolder: typeof body?.accountHolder === 'string' ? body.accountHolder : '',
      }),
      settlementType: parseSettlementType(body?.settlementType),
    };
    const invalid = creatorSettlementError(profile);
    if (invalid) {
      return NextResponse.json({ error: invalid, errorCode: 'INVALID_ACCOUNT' }, { status: 400, headers: NO_STORE });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '정산 계좌를 저장할 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    const updated = await admin
      .from('profiles')
      .update({
        bank_name: profile.bankName,
        account_number: profile.accountNumber,
        account_holder: profile.accountHolder,
        settlement_type: profile.settlementType,
      })
      .eq('id', actor.userId)
      .select(COLUMNS)
      .maybeSingle();
    if (updated.error && isSchemaMismatch(updated.error)) {
      return schemaMissing();
    }
    if (updated.error || !updated.data) {
      return NextResponse.json(
        { error: '정산 계좌를 저장하지 못했습니다.', errorCode: 'SAVE_FAILED' },
        { status: 500, headers: NO_STORE },
      );
    }

    return NextResponse.json(present(updated.data), { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '정산 계좌를 저장하지 못했습니다.', errorCode: 'SAVE_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}
