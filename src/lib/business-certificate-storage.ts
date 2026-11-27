import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  BUSINESS_CERTIFICATE_BUCKET,
  BUSINESS_CERTIFICATE_MAX_BYTES,
  BUSINESS_CERTIFICATE_SIGNED_TTL_SEC,
} from '@/lib/business-certificate';

type AdminClient = NonNullable<ReturnType<typeof createAdminClient>>;

export async function ensureBusinessCertificateBucket(admin: AdminClient) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) {
    return error.message;
  }
  if ((buckets ?? []).some((bucket) => bucket.name === BUSINESS_CERTIFICATE_BUCKET)) {
    return null;
  }
  const created = await admin.storage.createBucket(BUSINESS_CERTIFICATE_BUCKET, {
    public: false,
    fileSizeLimit: String(BUSINESS_CERTIFICATE_MAX_BYTES),
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'],
  });
  return created.error?.message ?? null;
}

export async function createBusinessCertificateSignedUrl(
  admin: AdminClient,
  path: string,
  expiresIn = BUSINESS_CERTIFICATE_SIGNED_TTL_SEC,
) {
  const trimmed = path.trim();
  if (!trimmed) {
    return { url: null, error: '등록된 사업자등록증이 없습니다.' };
  }
  const signed = await admin.storage
    .from(BUSINESS_CERTIFICATE_BUCKET)
    .createSignedUrl(trimmed, expiresIn);
  if (signed.error || !signed.data?.signedUrl) {
    return { url: null, error: signed.error?.message || '사업자등록증을 열 수 없습니다.' };
  }
  return { url: signed.data.signedUrl, error: null };
}

export async function removeBusinessCertificateObject(admin: AdminClient, path: string) {
  const trimmed = path.trim();
  if (!trimmed) {
    return;
  }
  const removed = await admin.storage.from(BUSINESS_CERTIFICATE_BUCKET).remove([trimmed]);
  if (removed.error) {
    console.warn('[SponsorAuction] 이전 사업자등록증 삭제 실패', removed.error.message);
  }
}
