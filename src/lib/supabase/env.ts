export const SUPABASE_ENV_MISSING_MESSAGE =
  'Supabase 환경 변수가 없습니다. `.env.local`에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정해 주세요.';

const MOCK_FALLBACK_MESSAGE =
  `[SponsorAuction] ${SUPABASE_ENV_MISSING_MESSAGE} 개발용 Mock 데이터로 전환합니다.`;

let hasWarnedMockFallback = false;

export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

function clean(value: string | undefined) {
  const trimmed = value?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  if (!trimmed || /YOUR_|placeholder/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function firstClean(values: Array<string | undefined>) {
  for (const value of values) {
    const cleaned = clean(value);
    if (cleaned) {
      return cleaned;
    }
  }
  return '';
}

type BrowserSupabaseConfig = {
  url?: string;
  anonKey?: string;
};

function browserSupabaseConfig(): BrowserSupabaseConfig | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const injected = (window as Window & { __CLINK_SUPABASE__?: BrowserSupabaseConfig }).__CLINK_SUPABASE__;
  return injected ?? null;
}

/**
 * 브라우저·공용 클라이언트용.
 * 빌드에 공개 키가 인라인되지 않은 배포는 서버가 심은 window.__CLINK_SUPABASE__ 를 사용한다.
 */
export function getSupabaseEnv(): SupabaseEnv | null {
  const injected = browserSupabaseConfig();
  const url = firstClean([
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL,
    injected?.url,
  ]);
  const anonKey = firstClean([
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    injected?.anonKey,
  ]);

  if (!url || !anonKey) {
    return null;
  }

  if (anonKey.length < 20) {
    console.error('[SponsorAuction] Supabase 공개 키 값이 너무 짧습니다.');
    return null;
  }

  return { url: url.replace(/\/$/, ''), anonKey };
}

/** 카카오/구글 콘솔에 등록하는 Supabase Auth 콜백. */
export function getSupabaseOAuthCallbackUrl() {
  const env = getSupabaseEnv();
  if (!env) {
    return null;
  }
  return `${env.url}/auth/v1/callback`;
}

/** 브라우저에 인라인된 공개 키. 서버가 env를 못 읽을 때 결제 API fallback용입니다. */
export function publicSupabasePayload() {
  const env = getSupabaseEnv();
  if (!env) {
    return {};
  }
  return {
    supabaseUrl: env.url,
    supabaseAnonKey: env.anonKey,
  };
}

export function warnMockFallback() {
  if (hasWarnedMockFallback) {
    return;
  }

  hasWarnedMockFallback = true;
  console.warn(MOCK_FALLBACK_MESSAGE);
}
