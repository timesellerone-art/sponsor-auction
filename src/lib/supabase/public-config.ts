import 'server-only';

function clean(value: string | undefined) {
  const trimmed = value?.trim().replace(/^["']+|["']+$/g, '') ?? '';
  if (!trimmed || /YOUR_|placeholder/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function readRuntimeEnv(name: string) {
  return Function('name', 'return process.env[name]')(name) as string | undefined;
}

function firstRuntime(names: readonly string[]) {
  for (const name of names) {
    const cleaned = clean(readRuntimeEnv(name));
    if (cleaned) {
      return cleaned;
    }
  }
  return '';
}

/** 서버 런타임 환경 변수. 브라우저 번들에 공개 키가 빠졌을 때 로그인 화면에 전달한다. */
export function readRuntimeSupabasePublicConfig() {
  const url = firstRuntime([
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_PROJECT_URL',
    'SUPABASE_URL',
  ]);
  const anonKey = firstRuntime([
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
  ]);
  if (!url || anonKey.length < 20) {
    return null;
  }
  return { url: url.replace(/\/$/, ''), anonKey };
}
