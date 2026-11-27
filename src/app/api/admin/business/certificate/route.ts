import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import { createBusinessCertificateSignedUrl } from '@/lib/business-certificate-storage';
import { forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { isUuid } from '@/lib/uuid';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;

export async function GET(request: Request) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/admin/business/certificate');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const actor = await getPaymentActor(request);
    if (!actor) {
      return unauthorizedJson('사업자등록증을 보려면 로그인해 주세요.');
    }
    if (actor.role !== 'admin') {
      return forbiddenJson('사업자등록증 열람은 관리자만 할 수 있습니다.');
    }

    const userId = new URL(request.url).searchParams.get('userId')?.trim() ?? '';
    if (!isUuid(userId)) {
      return NextResponse.json(
        { error: '회원 ID가 필요합니다.', errorCode: 'INVALID_USER' },
        { status: 400, headers: NO_STORE },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '사업자등록증을 열 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    const loaded = await admin
      .from('profiles')
      .select('business_certificate_path, business_certificate_name')
      .eq('id', userId)
      .maybeSingle();
    if (loaded.error && isSchemaMismatch(loaded.error)) {
      return NextResponse.json(
        { error: '사업자등록증 컬럼이 아직 없습니다. 마이그레이션을 적용해 주세요.', errorCode: 'SCHEMA_MISSING' },
        { status: 503, headers: NO_STORE },
      );
    }
    if (loaded.error || !loaded.data) {
      return NextResponse.json(
        { error: '회원을 찾지 못했습니다.', errorCode: 'NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }

    const path = loaded.data.business_certificate_path ?? '';
    const signed = await createBusinessCertificateSignedUrl(admin, path);
    if (signed.error || !signed.url) {
      return NextResponse.json(
        { error: signed.error || '등록된 사업자등록증이 없습니다.', errorCode: 'NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      {
        url: signed.url,
        name: loaded.data.business_certificate_name ?? '',
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '사업자등록증을 열 수 없습니다.', errorCode: 'LOOKUP_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}
