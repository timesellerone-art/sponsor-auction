import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { deleteCampaignListing, deleteJson } from '@/lib/listing-delete.server';
import { rethrowPrerenderError } from '@/lib/prerender-error';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('캠페인을 삭제하려면 로그인해 주세요.');
    }
    if (!hasAuthRole(actor, 'admin')) {
      return forbiddenJson('캠페인 삭제는 관리자만 할 수 있습니다.');
    }
    const { id } = await context.params;
    const result = await deleteCampaignListing(id, {
      userId: actor.userId,
      isAdmin: true,
    });
    const body = deleteJson(result);
    return NextResponse.json(body, {
      status: result.ok ? 200 : result.status,
      headers: NO_STORE,
    });
  } catch (error) {
    rethrowPrerenderError(error);
    const message = error instanceof Error ? error.message : '캠페인을 삭제하지 못했습니다.';
    return NextResponse.json(
      { error: message, errorMessage: message },
      { status: 500, headers: NO_STORE },
    );
  }
}
