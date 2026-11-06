type EnvMap = Record<string, string | undefined>;

export function isProductionRuntime(env: EnvMap = process.env) {
  return env.NODE_ENV === 'production';
}

export const PRODUCTION_REQUIRED_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_TOSS_CLIENT_KEY',
  'TOSS_SECRET_KEY',
  'NAVER_CLIENT_ID',
  'NAVER_CLIENT_SECRET',
  'SUPABASE_WEBHOOK_SECRET',
] as const;

function cleanEnvValue(value: string | undefined) {
  const trimmed = value?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  if (!trimmed || /YOUR_|placeholder|_HERE$/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

export function missingProductionEnvKeys(env: EnvMap = process.env) {
  return PRODUCTION_REQUIRED_ENV_KEYS.filter((key) => !cleanEnvValue(env[key]));
}

export function isLiveTossSecret(secret: string) {
  return secret.startsWith('live_');
}

export function isTestTossSecret(secret: string) {
  return secret.startsWith('test_');
}
