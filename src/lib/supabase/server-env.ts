import 'server-only';

/**
 * 서버(API Route) 전용. 클라이언트 번들에 절대 import 하지 마세요.
 * Next.js/Vercel은 `process.env.NAME` 정적 참조만 안전하게 주입합니다.
 */
function clean(value: string | undefined) {
  const trimmed = value?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  if (!trimmed || /YOUR_|placeholder/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function jwtRole(token: string) {
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload = JSON.parse(json) as { role?: string };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

function isAnonLike(token: string) {
  const role = jwtRole(token);
  return role === 'anon' || role === 'authenticated';
}

export type ServerEnvPresence = {
  NEXT_PUBLIC_SUPABASE_URL: boolean;
  SUPABASE_URL: boolean;
  SUPABASE_SERVICE_ROLE_KEY: boolean;
  SUPABASE_SERVICE_KEY: boolean;
  SUPABASE_SECRET_KEY: boolean;
  SUPABASE_KEY: boolean;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: boolean;
  SUPABASE_ANON_KEY: boolean;
};

export type PaymentWriteEnv = {
  url: string;
  key: string;
  keySource: string;
  usingServiceRole: boolean;
  presence: ServerEnvPresence;
  undefinedNames: string[];
};

function readStaticSnapshot() {
  const NEXT_PUBLIC_SUPABASE_URL = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const SUPABASE_URL = clean(process.env.SUPABASE_URL);
  const SUPABASE_SERVICE_ROLE_KEY = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const SUPABASE_SERVICE_KEY = clean(process.env.SUPABASE_SERVICE_KEY);
  const SUPABASE_SECRET_KEY = clean(process.env.SUPABASE_SECRET_KEY);
  const SUPABASE_KEY = clean(process.env.SUPABASE_KEY);
  const NEXT_PUBLIC_SUPABASE_ANON_KEY = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const SUPABASE_ANON_KEY = clean(process.env.SUPABASE_ANON_KEY);

  const presence: ServerEnvPresence = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean(NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_URL: Boolean(SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(SUPABASE_SERVICE_ROLE_KEY),
    SUPABASE_SERVICE_KEY: Boolean(SUPABASE_SERVICE_KEY),
    SUPABASE_SECRET_KEY: Boolean(SUPABASE_SECRET_KEY),
    SUPABASE_KEY: Boolean(SUPABASE_KEY),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_ANON_KEY: Boolean(SUPABASE_ANON_KEY),
  };

  const undefinedNames = (Object.entries(presence) as [keyof ServerEnvPresence, boolean][])
    .filter(([, present]) => !present)
    .map(([name]) => name);

  return {
    NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_SERVICE_KEY,
    SUPABASE_SECRET_KEY,
    SUPABASE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_ANON_KEY,
    presence,
    undefinedNames,
  };
}

function pickServiceRoleKey(snapshot: ReturnType<typeof readStaticSnapshot>) {
  const candidates = [
    { name: 'SUPABASE_SERVICE_ROLE_KEY', value: snapshot.SUPABASE_SERVICE_ROLE_KEY },
    { name: 'SUPABASE_SERVICE_KEY', value: snapshot.SUPABASE_SERVICE_KEY },
    { name: 'SUPABASE_SECRET_KEY', value: snapshot.SUPABASE_SECRET_KEY },
    { name: 'SUPABASE_KEY', value: snapshot.SUPABASE_KEY },
  ];

  for (const candidate of candidates) {
    if (!candidate.value || candidate.value.length < 20) {
      continue;
    }
    if (isAnonLike(candidate.value)) {
      console.error('[SponsorAuction] 서버 키가 anon/authenticated JWT라 service_role로 쓰지 않습니다.', {
        source: candidate.name,
        jwtRole: jwtRole(candidate.value),
        length: candidate.value.length,
      });
      continue;
    }
    return candidate;
  }
  return null;
}

export function getPaymentWriteEnv(): PaymentWriteEnv | null {
  const snapshot = readStaticSnapshot();
  const url = snapshot.NEXT_PUBLIC_SUPABASE_URL || snapshot.SUPABASE_URL;
  const service = pickServiceRoleKey(snapshot);
  const anon =
    snapshot.NEXT_PUBLIC_SUPABASE_ANON_KEY.length >= 20
      ? { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', value: snapshot.NEXT_PUBLIC_SUPABASE_ANON_KEY }
      : snapshot.SUPABASE_ANON_KEY.length >= 20
        ? { name: 'SUPABASE_ANON_KEY', value: snapshot.SUPABASE_ANON_KEY }
        : null;

  if (url && service) {
    return {
      url: url.replace(/\/$/, ''),
      key: service.value,
      keySource: service.name,
      usingServiceRole: true,
      presence: snapshot.presence,
      undefinedNames: snapshot.undefinedNames,
    };
  }

  if (url && anon) {
    return {
      url: url.replace(/\/$/, ''),
      key: anon.value,
      keySource: anon.name,
      usingServiceRole: false,
      presence: snapshot.presence,
      undefinedNames: snapshot.undefinedNames,
    };
  }

  return null;
}

export function describeMissingPaymentEnv() {
  const snapshot = readStaticSnapshot();
  return {
    presence: snapshot.presence,
    undefinedNames: snapshot.undefinedNames,
    hasUrl: Boolean(snapshot.NEXT_PUBLIC_SUPABASE_URL || snapshot.SUPABASE_URL),
    hasServiceRole: Boolean(pickServiceRoleKey(snapshot)),
    hasAnon: Boolean(snapshot.NEXT_PUBLIC_SUPABASE_ANON_KEY || snapshot.SUPABASE_ANON_KEY),
  };
}
