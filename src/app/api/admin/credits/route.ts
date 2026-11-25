import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  chargeUserCredit,
  deductUserCredit,
  getCreditBalance,
  restoreUserCredit,
} from '@/lib/credits';
import { forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/uuid';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

function asText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor) {
      return unauthorizedJson('크레딧 원장을 보려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('크레딧 원장은 관리자만 볼 수 있습니다.');
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '크레딧 원장을 불러올 수 없습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const url = new URL(request.url);
    const query = (url.searchParams.get('q') || '').trim();
    let userId = isUuid(query) ? query : '';
    if (!userId && query) {
      const profile = await admin
        .from('profiles')
        .select('id, name, email')
        .ilike('email', query)
        .limit(1)
        .maybeSingle();
      userId = profile.data?.id ?? '';
      if (!userId) {
        return NextResponse.json(
          { error: '해당 이메일의 회원을 찾지 못했습니다.', data: [] },
          { status: 404, headers: NO_STORE },
        );
      }
    }

    let ledger = admin
      .from('credit_transactions')
      .select('id, user_id, type, amount, balance_after, reference_id, description, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (userId) {
      ledger = ledger.eq('user_id', userId);
    }
    const listed = await ledger;
    if (listed.error) {
      return NextResponse.json(
        { error: '크레딧 원장을 불러오지 못했습니다.' },
        { status: 500, headers: NO_STORE },
      );
    }
    const balance = userId ? await getCreditBalance(admin, userId) : null;
    return NextResponse.json(
      { data: listed.data ?? [], userId: userId || null, balance },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '크레딧 원장을 불러오지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor) {
      return unauthorizedJson('크레딧을 조정하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('크레딧 조정은 관리자만 할 수 있습니다.');
    }
    const body = (await request.json().catch(() => null)) as {
      userId?: unknown;
      amount?: unknown;
      action?: unknown;
      description?: unknown;
    } | null;
    const userId = asText(body?.userId);
    const action = body?.action === 'refund' || body?.action === 'grant' || body?.action === 'deduct'
      ? body.action
      : '';
    const amount = typeof body?.amount === 'number' ? Math.round(body.amount) : Number(body?.amount);
    const description = asText(body?.description).slice(0, 120);
    if (!isUuid(userId) || !action || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: '회원, 금액, 조정 종류를 확인해 주세요.' },
        { status: 400, headers: NO_STORE },
      );
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '크레딧을 조정할 수 없습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const referenceId = `admin-${action}:${crypto.randomUUID()}`;
    const note =
      description ||
      (action === 'refund' ? '관리자 수동 환불' : action === 'grant' ? '관리자 수동 지급' : '관리자 수동 차감');
    const result =
      action === 'refund'
        ? await restoreUserCredit(admin, { userId, amount, type: 'REFUND', referenceId, description: note })
        : action === 'grant'
          ? await chargeUserCredit(admin, { userId, amount, referenceId, description: note })
          : await deductUserCredit(admin, { userId, amount, type: 'HOLD', referenceId, description: note });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error.message, errorCode: result.error.code },
        { status: result.error.code === 'INSUFFICIENT_CREDIT' ? 402 : 400, headers: NO_STORE },
      );
    }
    return NextResponse.json(
      { data: result.data, referenceId },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '크레딧을 조정하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
