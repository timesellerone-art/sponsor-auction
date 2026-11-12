import { connection } from 'next/server';
import { NextResponse } from 'next/server';
import {
  CAMPAIGN_COVER_BUCKET,
  validateCampaignCoverFile,
} from '@/lib/campaign-image';
import { canPreparePayment, forbiddenJson, getPaymentActor, unauthorizedJson } from '@/lib/payments/guard';
import { clientIp, consumeRateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';

const NO_STORE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate',
} as const;

async function ensureCoverBucket(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
) {
  const { data: buckets, error } = await admin.storage.listBuckets();
  if (error) {
    return error.message;
  }
  if ((buckets ?? []).some((bucket) => bucket.name === CAMPAIGN_COVER_BUCKET)) {
    return null;
  }
  const created = await admin.storage.createBucket(CAMPAIGN_COVER_BUCKET, {
    public: true,
    fileSizeLimit: '5242880',
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  });
  return created.error?.message ?? null;
}

export async function POST(request: Request) {
  try {
    await connection();
    const limited = consumeRateLimit(clientIp(request), '/api/campaign-cover');
    if (!limited.allowed) {
      return rateLimitResponse(limited.retryAfter);
    }

    const actor = await getPaymentActor();
    if (!actor) {
      return unauthorizedJson('대표 사진을 올리려면 로그인해 주세요.');
    }
    if (!canPreparePayment(actor)) {
      return forbiddenJson('광고주 계정으로만 대표 사진을 올릴 수 있습니다.');
    }

    const form = await request.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: '사진 파일이 필요합니다.' }, { status: 400, headers: NO_STORE });
    }

    const invalid = validateCampaignCoverFile(file);
    if (invalid) {
      return NextResponse.json({ error: invalid }, { status: 400, headers: NO_STORE });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: '저장소에 연결하지 못했습니다.' },
        { status: 500, headers: NO_STORE },
      );
    }

    const bucketError = await ensureCoverBucket(admin);
    if (bucketError) {
      console.warn('[SponsorAuction] campaign-covers 버킷 확인 실패', bucketError);
      return NextResponse.json(
        { error: '사진을 올리지 못했습니다. 캠페인은 기본 커버로 등록됩니다.' },
        { status: 500, headers: NO_STORE },
      );
    }

    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
    const safeExt = ['jpg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
    const owner = actor.userId?.trim() || 'advertiser';
    const path = `${owner}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage.from(CAMPAIGN_COVER_BUCKET).upload(path, bytes, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || `image/${safeExt}`,
    });

    if (error) {
      console.warn('[SponsorAuction] 캠페인 대표 사진 업로드 실패', error.message);
      return NextResponse.json(
        { error: '사진을 올리지 못했습니다. 캠페인은 기본 커버로 등록됩니다.' },
        { status: 500, headers: NO_STORE },
      );
    }

    const { data } = admin.storage.from(CAMPAIGN_COVER_BUCKET).getPublicUrl(path);
    if (!data.publicUrl) {
      return NextResponse.json(
        { error: '사진을 올리지 못했습니다. 캠페인은 기본 커버로 등록됩니다.' },
        { status: 500, headers: NO_STORE },
      );
    }

    return NextResponse.json({ url: data.publicUrl }, { headers: NO_STORE });
  } catch (error) {
    console.warn('[SponsorAuction] 캠페인 대표 사진 업로드 예외', error);
    return NextResponse.json(
      { error: '사진을 올리지 못했습니다. 캠페인은 기본 커버로 등록됩니다.' },
      { status: 500, headers: NO_STORE },
    );
  }
}
