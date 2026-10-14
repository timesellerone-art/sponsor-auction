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
  serviceRoleSource: string;
};

export const SUPABASE_URL_ENV_NAMES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PROJECT_URL',
  'SUPABASE_PROJECT_URL',
] as const;

export const SUPABASE_SERVICE_KEY_ENV_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_KEY',
  'SUPABASE_SERVICE_KEY',
  'SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE',
] as const;

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

function readJwtRole(token: string) {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

function describeEnvName(name: string) {
  const raw = process.env[name];
  const value = readEnv(name);
  return {
    present: Boolean(raw && String(raw).trim()),
    usable: Boolean(value),
    length: value.length,
    jwtRole: value ? readJwtRole(value) : null,
  };
}

function readFirstEnv(names: readonly string[]) {
  for (const name of names) {
    const value = readEnv(name);
    if (value) {
      return { name, value };
    }
  }
  return { name: names[0] ?? '', value: '' };
}

function readServiceRoleKey(options?: { silent?: boolean }) {
  for (const name of SUPABASE_SERVICE_KEY_ENV_NAMES) {
    const value = readEnv(name);
    if (!value) {
      continue;
    }
    const role = readJwtRole(value);
    if (role === 'anon' || role === 'authenticated') {
      if (!options?.silent) {
        console.error('[SponsorAuction] 서버용 키가 아님(anon/authenticated). 건너뜁니다.', {
          source: name,
          jwtRole: role,
          length: value.length,
        });
      }
      continue;
    }
    return { name, value, jwtRole: role };
  }

  for (const name of Object.keys(process.env)) {
    if (!/SERVICE_ROLE/i.test(name) || /ANON|PUBLISHABLE|NEXT_PUBLIC/i.test(name)) {
      continue;
    }
    const value = readEnv(name);
    if (!value) {
      continue;
    }
    const role = readJwtRole(value);
    if (role === 'anon' || role === 'authenticated') {
      continue;
    }
    return { name, value, jwtRole: role };
  }

  return { name: '', value: '', jwtRole: null as string | null };
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
  const urlResult = readFirstEnv(SUPABASE_URL_ENV_NAMES);
  const keyResult = readServiceRoleKey();

  if (!urlResult.value || !keyResult.value) {
    return null;
  }

  const url = normalizeSupabaseUrl(urlResult.value);
  if (!isLikelySupabaseUrl(url)) {
    console.error('[SponsorAuction] Supabase URL 형식이 올바르지 않습니다.', {
      source: urlResult.name,
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
    serviceRoleSource: keyResult.name,
  };
}

export function describeSupabaseServerEnv() {
  const urlStatus = Object.fromEntries(
    SUPABASE_URL_ENV_NAMES.map((name) => [name, describeEnvName(name)]),
  );
  const keyStatus = Object.fromEntries(
    SUPABASE_SERVICE_KEY_ENV_NAMES.map((name) => [name, describeEnvName(name)]),
  );
  const related = Object.keys(process.env)
    .filter((name) => /supabase|service_role/i.test(name))
    .sort()
    .map((name) => ({ name, ...describeEnvName(name) }));

  const empty = [
    ...SUPABASE_URL_ENV_NAMES.filter((name) => !describeEnvName(name).usable),
    ...SUPABASE_SERVICE_KEY_ENV_NAMES.filter((name) => !describeEnvName(name).usable),
  ];

  return {
    urlStatus,
    keyStatus,
    empty,
    related,
    hasAnyUrl: SUPABASE_URL_ENV_NAMES.some((name) => describeEnvName(name).usable),
    hasAnyServiceKey: Boolean(readServiceRoleKey({ silent: true }).value),
  };
}

export function warnMockFallback() {
  if (hasWarnedMockFallback) {
    return;
  }

  hasWarnedMockFallback = true;
  console.warn(MOCK_FALLBACK_MESSAGE);
}
