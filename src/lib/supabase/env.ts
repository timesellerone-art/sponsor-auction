export const SUPABASE_ENV_MISSING_MESSAGE =
  'Supabase 환경 변수가 없습니다. `.env.local`에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정해 주세요.';

const MOCK_FALLBACK_MESSAGE =
  `[SponsorAuction] ${SUPABASE_ENV_MISSING_MESSAGE} 개발용 Mock 데이터로 전환합니다.`;

let hasWarnedMockFallback = false;

export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  if (
    url.includes('YOUR_PROJECT') ||
    anonKey.includes('YOUR_SUPABASE_ANON_KEY') ||
    anonKey === 'YOUR_ANON_KEY'
  ) {
    return null;
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url.replace(/\/$/, ''))) {
    console.error(
      '[SponsorAuction] NEXT_PUBLIC_SUPABASE_URL 형식이 올바르지 않습니다. https://<ref>.supabase.co 형태여야 합니다.',
    );
    return null;
  }

  if (anonKey.length < 20) {
    console.error('[SponsorAuction] NEXT_PUBLIC_SUPABASE_ANON_KEY 값이 너무 짧습니다.');
    return null;
  }

  return { url: url.replace(/\/$/, ''), anonKey };
}

export function warnMockFallback() {
  if (hasWarnedMockFallback) {
    return;
  }

  hasWarnedMockFallback = true;
  console.warn(MOCK_FALLBACK_MESSAGE);
}
