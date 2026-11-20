import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { setPayoutHold } from '@/lib/payouts';
import { forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor) {
      return unauthorizedJson('정산 보류를 하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('정산 보류는 관리자만 할 수 있습니다.');
    }
    const body = (await request.json().catch(() => null)) as { id?: unknown; hold?: unknown } | null;
    const id = typeof body?.id === 'string' ? body.id.trim() : '';
    if (!id || typeof body?.hold !== 'boolean') {
      return NextResponse.json(
        { error: '정산 ID와 보류 여부를 지정해 주세요.' },
        { status: 400, headers: NO_STORE },
      );
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '정산 보류를 저장할 수 없습니다.', fallbackMock: true },
        { status: 409, headers: NO_STORE },
      );
    }
    const saved = await setPayoutHold(admin, { id, hold: body.hold });
    if (!saved.ok) {
      return NextResponse.json({ error: saved.message }, { status: 409, headers: NO_STORE });
    }
    return NextResponse.json({ data: saved.data }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '정산 보류를 저장하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
