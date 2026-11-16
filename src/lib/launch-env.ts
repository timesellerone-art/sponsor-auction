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

/** Vercel Production 배포만 해당. Preview/`next start`는 NODE_ENV=production이어도 제외합니다. */
export function isVercelProduction(env: EnvMap = process.env) {
  return env.VERCEL_ENV === 'production';
}

export function isLiveTossSecret(secret: string) {
  return secret.startsWith('live_');
}

export function isTestTossSecret(secret: string) {
  return secret.startsWith('test_');
}

export function isLiveTossClientKey(key: string) {
  return key.startsWith('live_');
}

export function isTestTossClientKey(key: string) {
  return key.startsWith('test_');
}

export type ProductionTossLiveKeyCode =
  | 'TOSS_TEST_KEY_IN_PRODUCTION'
  | 'TOSS_LIVE_KEY_MISSING';

/** Vercel Production에서 test_/누락 키를 쓰면 실결제를 막습니다. Preview는 허용합니다. */
export function productionTossLiveKeyError(
  env: EnvMap = process.env,
  keys: { clientKey?: string; secretKey?: string } = {},
): ProductionTossLiveKeyCode | null {
  if (!isVercelProduction(env)) {
    return null;
  }
  const clientKey = keys.clientKey?.trim() ?? '';
  const secretKey = keys.secretKey?.trim() ?? '';
  if (isTestTossClientKey(clientKey) || isTestTossSecret(secretKey)) {
    return 'TOSS_TEST_KEY_IN_PRODUCTION';
  }
  if (!isLiveTossClientKey(clientKey) || !isLiveTossSecret(secretKey)) {
    return 'TOSS_LIVE_KEY_MISSING';
  }
  return null;
}
