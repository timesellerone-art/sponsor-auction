import { connection } from 'next/server';

export type PaymentSupabaseConfig = {
  url: string;
  serviceKey: string;
  anonKey: string;
};

function trimEnv(value: string | undefined) {
  return value?.trim().replace(/^["']+|["']+$/g, '') || '';
}

/** 요청 시점에 읽습니다. 모듈 로드 시 빈 문자열로 고정하지 않습니다. */
export function readPaymentSupabaseConfig(
  override?: Partial<PaymentSupabaseConfig>,
): PaymentSupabaseConfig {
  const url = trimEnv(
    override?.url || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  ).replace(/\/$/, '');
  const serviceKey = trimEnv(
    override?.serviceKey ||
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SERVICE_KEY ||
      process.env.SUPABASE_SECRET_KEY,
  );
  const anonKey = trimEnv(
    override?.anonKey ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY,
  );

  return { url, serviceKey, anonKey };
}

export function isPublicSupabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname.endsWith('.supabase.co');
  } catch {
    return false;
  }
}

export function publicSupabaseFromClient(url?: string, anonKey?: string): Partial<PaymentSupabaseConfig> {
  const cleanedUrl = trimEnv(url).replace(/\/$/, '');
  const cleanedKey = trimEnv(anonKey);
  if (!cleanedUrl || !cleanedKey || cleanedKey.length < 20 || !isPublicSupabaseUrl(cleanedUrl)) {
    return {};
  }
  return { url: cleanedUrl, anonKey: cleanedKey };
}

export async function paymentDbConfigForRequest(input?: {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}): Promise<PaymentSupabaseConfig> {
  await connection();
  const fromEnv = readPaymentSupabaseConfig();
  const fromClient = publicSupabaseFromClient(input?.supabaseUrl, input?.supabaseAnonKey);
  return {
    url: fromEnv.url || fromClient.url || '',
    serviceKey: fromEnv.serviceKey,
    anonKey: fromEnv.anonKey || fromClient.anonKey || '',
  };
}

export function describePaymentSupabaseConfig(config: PaymentSupabaseConfig) {
  return {
    hasUrl: Boolean(config.url),
    urlLength: config.url.length,
    hasServiceKey: Boolean(config.serviceKey),
    serviceKeyLength: config.serviceKey.length,
    hasAnonKey: Boolean(config.anonKey),
    anonKeyLength: config.anonKey.length,
  };
}
