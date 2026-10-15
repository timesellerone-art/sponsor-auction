import { NextResponse } from 'next/server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import type { ProfileStatus } from '@/types/admin';

const PROFILE_COLUMNS = 'id, name, email, role, status, created_at';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(request: Request) {
  try {
    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('회원 상태를 변경하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('회원 정지/해제는 관리자만 할 수 있습니다.');
    }

    const body = (await request.json().catch(() => null)) as {
      id?: string;
      status?: string;
    } | null;
    const id = body?.id?.trim() ?? '';
    const status = body?.status === 'suspended' ? 'suspended' : body?.status === 'active' ? 'active' : '';
    if (!id || !status) {
      return NextResponse.json(
        { error: '회원 ID와 상태가 필요합니다.', fallbackMock: true },
        { status: 409 },
      );
    }

    const nextStatus = status as ProfileStatus;
    if (!isUuid(id)) {
      return NextResponse.json({ fallbackMock: true }, { status: 409 });
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json({ fallbackMock: true }, { status: 409 });
    }

    const current = await client
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .eq('id', id)
      .maybeSingle();

    if (current.error && isSchemaMismatch(current.error)) {
      return NextResponse.json({ fallbackMock: true }, { status: 409 });
    }
    if (current.error || !current.data) {
      return NextResponse.json({ error: '해당 회원을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (current.data.role === 'admin') {
      return NextResponse.json({ error: '관리자 계정은 제재할 수 없습니다.' }, { status: 403 });
    }

    const { data, error } = await client
      .from('profiles')
      .update({ status: nextStatus })
      .eq('id', id)
      .select(PROFILE_COLUMNS)
      .maybeSingle();

    if (error || !data) {
      console.error('[SponsorAuction] 관리자 회원 상태 DB 저장 실패', error);
      return NextResponse.json(
        { error: '회원 상태를 저장하지 못했습니다.' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      data: {
        id: data.id,
        name: data.name,
        email: data.email,
        role: data.role,
        status: data.status,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error('[SponsorAuction] 관리자 회원 상태 API 예외', error);
    return NextResponse.json({ error: '회원 상태를 저장하지 못했습니다.' }, { status: 500 });
  }
}
