import { rethrowPrerenderError } from '@/lib/prerender-error';
import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  BUSINESS_CERTIFICATE_BUCKET,
  businessCertificateUploadBlockReason,
  certificateStoragePath,
  validateBusinessCertificateFile,
} from '@/lib/business-certificate';
import {
  createBusinessCertificateSignedUrl,
  ensureBusinessCertificateBucket,
  removeBusinessCertificateObject,
} from '@/lib/business-certificate-storage';
import {
  isBusinessVerificationStatus,
  ntsBusinessLabelFromText,
} from '@/lib/business-registration';
import {
  forbiddenJson,
  getPaymentActor,
  unauthorizedJson,
} from '@/lib/payments/guard';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchemaMismatch } from '@/lib/supabase/errors';
import { hasAuthRole } from '@/types/auth';

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' } as const;
const CERT_COLUMNS = 'business_certificate_path, business_certificate_name, business_verification_status, business_status_detail';

function canManageBusiness(actor: { roles?: unknown } | null) {
  return Boolean(
    actor &&
      (hasAuthRole(actor, 'advertiser') || hasAuthRole(actor, 'creator') || hasAuthRole(actor, 'admin')),
  );
}

export async function GET(request: Request) {
  try {
    await connection();
    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('사업자등록증을 보려면 로그인해 주세요.');
    }
    if (!canManageBusiness(actor)) {
      return forbiddenJson('사업자등록증은 본인 계정에서만 볼 수 있습니다.');
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
      .eq('id', actor.userId)
      .maybeSingle();
    if (loaded.error && isSchemaMismatch(loaded.error)) {
      return NextResponse.json(
        { error: '사업자등록증 컬럼이 아직 없습니다. 마이그레이션을 적용해 주세요.', errorCode: 'SCHEMA_MISSING' },
        { status: 503, headers: NO_STORE },
      );
    }
    const path = typeof loaded.data?.business_certificate_path === 'string'
      ? loaded.data.business_certificate_path
      : '';
    const name = typeof loaded.data?.business_certificate_name === 'string'
      ? loaded.data.business_certificate_name
      : '';
    const signed = await createBusinessCertificateSignedUrl(admin, path);
    if (signed.error || !signed.url) {
      return NextResponse.json(
        { error: signed.error || '등록된 사업자등록증이 없습니다.', errorCode: 'NOT_FOUND' },
        { status: 404, headers: NO_STORE },
      );
    }
    return NextResponse.json({ url: signed.url, name }, { headers: NO_STORE });
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '사업자등록증을 열 수 없습니다.', errorCode: 'LOOKUP_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}

export async function POST(request: Request) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/account/business/certificate');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const actor = await getPaymentActor(request);
    if (!actor?.userId) {
      return unauthorizedJson('사업자등록증을 올리려면 로그인해 주세요.');
    }
    if (!canManageBusiness(actor)) {
      return forbiddenJson('사업자등록증은 광고주 또는 크리에이터 계정에서 관리합니다.');
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json(
        { error: '사업자등록증 파일이 필요합니다.', errorCode: 'FILE_REQUIRED' },
        { status: 400, headers: NO_STORE },
      );
    }
    const invalid = validateBusinessCertificateFile(file);
    if (invalid) {
      return NextResponse.json({ error: invalid, errorCode: 'INVALID_FILE' }, { status: 400, headers: NO_STORE });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '사업자등록증을 저장할 수 없습니다.', errorCode: 'ADMIN_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    const current = await admin.from('profiles').select(CERT_COLUMNS).eq('id', actor.userId).maybeSingle();
    if (current.error && isSchemaMismatch(current.error)) {
      return NextResponse.json(
        { error: '사업자등록증 컬럼이 아직 없습니다. 마이그레이션을 적용해 주세요.', errorCode: 'SCHEMA_MISSING' },
        { status: 503, headers: NO_STORE },
      );
    }
    const statusRaw = current.data?.business_verification_status ?? '';
    const status = isBusinessVerificationStatus(statusRaw) ? statusRaw : 'unregistered';
    const detail = current.data?.business_status_detail ?? '';
    const ntsLabel = ntsBusinessLabelFromText(detail);
    const blocked = businessCertificateUploadBlockReason({
      status,
      ntsLabel,
      mismatch: ntsLabel === '불일치',
      detail,
    });
    if (blocked && (status === 'closed' || ntsLabel === '불일치' || ntsLabel === '휴업자' || ntsLabel === '폐업자')) {
      return NextResponse.json({ error: blocked, errorCode: 'UPLOAD_BLOCKED' }, { status: 409, headers: NO_STORE });
    }

    const bucketError = await ensureBusinessCertificateBucket(admin);
    if (bucketError) {
      console.warn('[SponsorAuction] business-certificates 버킷 확인 실패', bucketError);
      return NextResponse.json(
        { error: '저장소를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.', errorCode: 'BUCKET_UNAVAILABLE' },
        { status: 503, headers: NO_STORE },
      );
    }

    const path = certificateStoragePath(actor.userId, file.name);
    const bytes = Buffer.from(await file.arrayBuffer());
    const uploaded = await admin.storage.from(BUSINESS_CERTIFICATE_BUCKET).upload(path, bytes, {
      cacheControl: '60',
      upsert: false,
      contentType: file.type || 'application/octet-stream',
    });
    if (uploaded.error) {
      console.warn('[SponsorAuction] 사업자등록증 업로드 실패', uploaded.error.message);
      return NextResponse.json(
        { error: '사업자등록증을 올리지 못했습니다.', errorCode: 'UPLOAD_FAILED' },
        { status: 500, headers: NO_STORE },
      );
    }

    const previousPath =
      typeof current.data?.business_certificate_path === 'string'
        ? current.data.business_certificate_path
        : '';
    const saved = await admin
      .from('profiles')
      .update({
        business_certificate_path: path,
        business_certificate_name: file.name.slice(0, 120),
      })
      .eq('id', actor.userId)
      .select('business_certificate_path, business_certificate_name')
      .maybeSingle();
    if (saved.error || !saved.data) {
      await removeBusinessCertificateObject(admin, path);
      return NextResponse.json(
        { error: '사업자등록증 경로를 저장하지 못했습니다.', errorCode: 'SAVE_FAILED' },
        { status: 500, headers: NO_STORE },
      );
    }
    if (previousPath && previousPath !== path) {
      await removeBusinessCertificateObject(admin, previousPath);
    }

    return NextResponse.json(
      {
        name: saved.data.business_certificate_name,
        hasCertificate: true,
      },
      { headers: NO_STORE },
    );
  } catch (error) {
    rethrowPrerenderError(error);
    return NextResponse.json(
      { error: '사업자등록증을 올리지 못했습니다.', errorCode: 'UPLOAD_FAILED' },
      { status: 500, headers: NO_STORE },
    );
  }
}
