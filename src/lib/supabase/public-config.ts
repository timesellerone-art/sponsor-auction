import 'server-only';

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

/**
 * 서버가 빌드·요청 시점에 읽는 공개 Supabase 설정.
 * `process.env.NAME` 정적 참조만 Next가 클라이언트 번들과 서버 함수에 넣는다.
 */
export function readSupabasePublicConfig() {
  const url = firstClean([
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL,
    process.env.SUPABASE_URL,
  ]);
  const anonKey = firstClean([
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.SUPABASE_ANON_KEY,
    process.env.SUPABASE_PUBLISHABLE_KEY,
  ]);
  if (!url || anonKey.length < 20) {
    return null;
  }
  return { url: url.replace(/\/$/, ''), anonKey };
}
