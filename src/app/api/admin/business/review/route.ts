import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  businessVerificationLabel,
  formatBusinessNumber,
  isBusinessVerificationStatus,
} from '@/lib/business-registration';
import { forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { isUuid } from '@/lib/uuid';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function POST(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor) {
      return unauthorizedJson('사업자 검수를 하려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('사업자 검수는 관리자만 할 수 있습니다.');
    }

    const body = (await request.json().catch(() => null)) as {
      userId?: unknown;
      decision?: unknown;
      note?: unknown;
    } | null;
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    const decision = body?.decision === 'approve' || body?.decision === 'reject' ? body.decision : '';
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) : '';
    if (!isUuid(userId) || !decision) {
      return NextResponse.json(
        { error: '회원과 승인 또는 반려를 지정해 주세요.' },
        { status: 400, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '사업자 검수를 저장할 수 없습니다.' },
        { status: 503, headers: NO_STORE },
      );
    }

    const current = await admin
      .from('profiles')
      .select('id, business_registration_number, business_verification_status')
      .eq('id', userId)
      .maybeSingle();
    if (current.error && isSchemaMismatch(current.error)) {
      return NextResponse.json(
        { error: '사업자등록번호 컬럼이 아직 없습니다. 마이그레이션을 적용해 주세요.' },
        { status: 503, headers: NO_STORE },
      );
    }
    if (current.error || !current.data) {
      return NextResponse.json(
        { error: '회원을 찾지 못했습니다.' },
        { status: 404, headers: NO_STORE },
      );
    }
    const number = (current.data.business_registration_number ?? '').replace(/\D/g, '');
    const status = isBusinessVerificationStatus(current.data.business_verification_status ?? '')
      ? current.data.business_verification_status
      : 'unregistered';
    if (number.length !== 10) {
      return NextResponse.json(
        { error: '저장된 사업자등록번호가 없어 검수할 수 없습니다.' },
        { status: 409, headers: NO_STORE },
      );
    }
    if (decision === 'approve' && status === 'closed') {
      return NextResponse.json(
        { error: '휴폐업 상태는 승인할 수 없습니다.' },
        { status: 409, headers: NO_STORE },
      );
    }
    if (decision === 'approve' && status === 'unregistered') {
      return NextResponse.json(
        { error: '미등록 상태는 승인할 수 없습니다.' },
        { status: 409, headers: NO_STORE },
      );
    }

    const nextStatus = decision === 'approve' ? 'verified' : 'rejected';
    const detail =
      decision === 'approve'
        ? '관리자가 사업자 인증을 승인했습니다.'
        : note || '관리자가 사업자 인증을 반려했습니다.';
    const updated = await admin
      .from('profiles')
      .update({
        business_verification_status: nextStatus,
        business_status_detail: detail,
        business_review_note: note,
        business_checked_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select('id, name, email, business_registration_number, business_verification_status, business_status_detail, business_review_note')
      .maybeSingle();
    if (updated.error || !updated.data) {
      return NextResponse.json(
        { error: '사업자 검수를 저장하지 못했습니다.' },
        { status: 500, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        data: {
          id: updated.data.id,
          businessRegistrationNumber: formatBusinessNumber(updated.data.business_registration_number),
          businessVerificationStatus: updated.data.business_verification_status,
          businessStatusDetail: updated.data.business_status_detail,
          businessReviewNote: updated.data.business_review_note,
          businessVerificationLabel: businessVerificationLabel(nextStatus),
        },
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '사업자 검수를 저장하지 못했습니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
