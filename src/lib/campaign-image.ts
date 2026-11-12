import { createClient } from '@/lib/supabase/client';

export const CAMPAIGN_COVER_BUCKET = 'campaign-covers';
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/jpg']);

export function validateCampaignCoverFile(file: File) {
  if (!ALLOWED_TYPES.has(file.type) && !/\.(jpe?g|png|webp)$/i.test(file.name)) {
    return 'JPG, PNG, WEBP 이미지만 올릴 수 있습니다.';
  }
  if (file.size > MAX_COVER_BYTES) {
    return '대표 사진은 5MB 이하로 올려 주세요.';
  }
  return null;
}

export async function uploadCampaignCover(file: File, userId?: string | null) {
  const invalid = validateCampaignCoverFile(file);
  if (invalid) {
    return { url: null, error: invalid };
  }

  const supabase = createClient();
  if (!supabase) {
    return { url: URL.createObjectURL(file), error: null };
  }

  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const safeExt = ['jpg', 'png', 'webp'].includes(ext) ? ext : 'jpg';
  const path = `${userId?.trim() || 'anonymous'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${safeExt}`;

  const { error } = await supabase.storage.from(CAMPAIGN_COVER_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || `image/${safeExt}`,
  });

  if (error) {
    console.error('[SponsorAuction] 캠페인 대표 사진 업로드 실패:', error);
    return { url: null, error: '사진을 올리지 못했습니다. 캠페인은 기본 커버로 등록됩니다.' };
  }

  const { data } = supabase.storage.from(CAMPAIGN_COVER_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl || null, error: null };
}
