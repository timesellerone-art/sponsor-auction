/**
 * 결제 API 서버 번들에 환경 변수가 들어가도록
 * process.env.NAME 을 모듈 최상단에서 정적 참조합니다.
 */
export const PAYMENT_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';

export const PAYMENT_SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  '';

export const PAYMENT_SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

export type PaymentSupabaseConfig = {
  url: string;
  serviceKey: string;
  anonKey: string;
};

export function readPaymentSupabaseConfig(
  override?: Partial<PaymentSupabaseConfig>,
): PaymentSupabaseConfig {
  return {
    url: (override?.url || PAYMENT_SUPABASE_URL).trim().replace(/\/$/, ''),
    serviceKey: (override?.serviceKey || PAYMENT_SUPABASE_SERVICE_ROLE_KEY).trim(),
    anonKey: (override?.anonKey || PAYMENT_SUPABASE_ANON_KEY).trim(),
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
