import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { loadAdminBusinessFieldsByUserId } from '@/lib/admin-profile-business.server';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/uuid';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor) {
      return unauthorizedJson('회원 사업자 정보를 조회하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('회원 사업자 정보는 관리자만 볼 수 있습니다.');
    }

    const userId = new URL(request.url).searchParams.get('userId')?.trim() ?? '';
    if (!isUuid(userId)) {
      return NextResponse.json(
        { error: '회원 ID가 필요합니다.', errorCode: 'INVALID_USER' },
        { status: 400, headers: NO_STORE },
      );
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        { error: '회원 사업자 정보를 읽을 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    const loaded = await loadAdminBusinessFieldsByUserId(client, userId);
    if (loaded.error) {
      return NextResponse.json(
        { error: '회원 사업자 정보를 불러오지 못했습니다.', errorCode: 'LOOKUP_FAILED' },
        { status: 500, headers: NO_STORE },
      );
    }
    if (!loaded.fields) {
      return NextResponse.json(
        { error: '회원을 찾지 못했습니다.', errorCode: 'NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }

    return NextResponse.json({ data: loaded.fields }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '회원 사업자 정보를 불러오지 못했습니다.', errorCode: 'LOOKUP_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}
