export const SUPABASE_ENV_MISSING_MESSAGE =
  'Supabase 환경 변수가 없습니다. `.env.local`에 NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정해 주세요.';

const MOCK_FALLBACK_MESSAGE =
  `[SponsorAuction] ${SUPABASE_ENV_MISSING_MESSAGE} 개발용 Mock 데이터로 전환합니다.`;

let hasWarnedMockFallback = false;

export type SupabaseEnv = {
  url: string;
  anonKey: string;
};

export type SupabaseAdminEnv = {
  url: string;
  serviceRoleKey: string;
  serviceRoleSource: 'SUPABASE_SERVICE_ROLE_KEY' | 'SUPABASE_SECRET_KEY';
};

function readEnv(name: string) {
  const value = process.env[name]?.trim().replace(/^["']+|["']+$/g, '') || '';
  if (!value) {
    return '';
  }
  if (/YOUR_|placeholder|example\.com/i.test(value)) {
    return '';
  }
  return value;
}

function readFirstEnv(names: string[]) {
  for (const name of names) {
    const value = readEnv(name);
    if (value) {
      return { name, value };
    }
  }
  return { name: names[0] ?? '', value: '' };
}

function normalizeSupabaseUrl(url: string) {
  return url.replace(/\/$/, '');
}

function isLikelySupabaseUrl(url: string) {
  if (/^https?:\/\/127\.0\.0\.1:\d+/i.test(url) || /^https?:\/\/localhost:\d+/i.test(url)) {
    return true;
  }
  return /^https:\/\/[a-z0-9-]+\.supabase\.(co|com)(\/.*)?$/i.test(url);
}

export function getSupabaseEnv(): SupabaseEnv | null {
  const url = readFirstEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']).value;
  const anonKey = readFirstEnv([
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_ANON_KEY',
  ]).value;

  if (!url || !anonKey) {
    return null;
  }

  const normalizedUrl = normalizeSupabaseUrl(url);
  if (!isLikelySupabaseUrl(normalizedUrl)) {
    console.error(
      '[SponsorAuction] NEXT_PUBLIC_SUPABASE_URL 형식이 올바르지 않습니다. https://<ref>.supabase.co 형태여야 합니다.',
    );
    return null;
  }

  if (anonKey.length < 20) {
    console.error('[SponsorAuction] NEXT_PUBLIC_SUPABASE_ANON_KEY 값이 너무 짧습니다.');
    return null;
  }

  return { url: normalizedUrl, anonKey };
}

/** 서버 전용. payments 저장은 anon 키가 아니라 service_role 시크릿을 사용합니다. */
export function getSupabaseAdminEnv(): SupabaseAdminEnv | null {
  const urlResult = readFirstEnv(['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL']);
  const keyResult = readFirstEnv(['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY']);

  if (!urlResult.value || !keyResult.value) {
    return null;
  }

  const url = normalizeSupabaseUrl(urlResult.value);
  if (!isLikelySupabaseUrl(url)) {
    console.error('[SponsorAuction] Supabase URL 형식이 올바르지 않습니다.', {
      hasUrl: true,
      urlHost: (() => {
        try {
          return new URL(url).host;
        } catch {
          return 'invalid';
        }
      })(),
    });
    return null;
  }

  if (keyResult.value.length < 20) {
    console.error('[SponsorAuction] Supabase service_role 키 값이 너무 짧습니다.', {
      source: keyResult.name,
      length: keyResult.value.length,
    });
    return null;
  }

  return {
    url,
    serviceRoleKey: keyResult.value,
    serviceRoleSource: keyResult.name as SupabaseAdminEnv['serviceRoleSource'],
  };
}

export function describeSupabaseServerEnv() {
  return {
    hasNextPublicUrl: Boolean(readEnv('NEXT_PUBLIC_SUPABASE_URL')),
    hasSupabaseUrl: Boolean(readEnv('SUPABASE_URL')),
    hasAnonKey: Boolean(readEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || readEnv('SUPABASE_ANON_KEY')),
    hasServiceRoleKey: Boolean(readEnv('SUPABASE_SERVICE_ROLE_KEY')),
    hasSecretKey: Boolean(readEnv('SUPABASE_SECRET_KEY')),
  };
}

export function warnMockFallback() {
  if (hasWarnedMockFallback) {
    return;
  }

  hasWarnedMockFallback = true;
  console.warn(MOCK_FALLBACK_MESSAGE);
}
