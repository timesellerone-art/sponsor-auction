import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { loadAdvertiserDashboardFromClient } from '@/lib/dashboard';
import { forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { uuidIds } from '@/lib/uuid';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function GET(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('캠페인을 보려면 로그인해 주세요.');
    }
    if (
      !hasAuthRole(actor, 'advertiser') &&
      !hasAuthRole(actor, 'admin')
    ) {
      return forbiddenJson('캠페인 목록은 광고주 계정에서 확인할 수 있습니다.');
    }

    const client = createAdminClient();
    if (!client) {
      return NextResponse.json(
        { error: '캠페인 목록을 불러올 수 없습니다.', data: [] },
        { status: 503, headers: NO_STORE },
      );
    }

    const extraIds = uuidIds(
      new URL(request.url).searchParams.get('ids')?.split(/[,\s]+/) ?? [],
    );
    const result = await loadAdvertiserDashboardFromClient(client, actor.userId, extraIds);
    return NextResponse.json(
      { data: result.data, error: result.error },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '캠페인 목록을 불러오지 못했습니다.';
    return NextResponse.json({ error: message, data: [] }, { status: 500, headers: NO_STORE });
  }
}
