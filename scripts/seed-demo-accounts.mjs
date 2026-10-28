// 로그인 화면에 안내된 데모 계정을 실제 Supabase Auth 계정으로 만든다(이미 있으면 비밀번호·역할만 맞춘다).
// 사용법: node scripts/seed-demo-accounts.mjs  (.env.local의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 사용)
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnv() {
  const values = { ...process.env };
  try {
    for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index <= 0 || line.trim().startsWith('#')) {
        continue;
      }
      const key = line.slice(0, index).trim();
      values[key] ??= line.slice(index + 1).trim().replace(/^"|"$/g, '');
    }
  } catch {
    // .env.local이 없으면 process.env만 사용한다.
  }
  return values;
}

const DEMO_PASSWORD = 'demo1234';
const ACCOUNTS = [
  { email: 'admin@demo.com', name: '데모 관리자', role: 'admin', roles: ['admin'], mode: null },
  {
    email: 'brand@demo.com',
    name: '데모 광고주',
    role: 'advertiser',
    roles: ['advertiser', 'creator'],
    mode: 'advertiser',
  },
  {
    email: 'creator@demo.com',
    name: '데모 크리에이터',
    role: 'creator',
    roles: ['advertiser', 'creator'],
    mode: 'creator',
  },
];

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 필요합니다.');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: listed, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) {
  console.error('사용자 조회 실패', listError.message);
  process.exit(1);
}

for (const account of ACCOUNTS) {
  const metadata = {
    name: account.name,
    role: account.role,
    roles: account.roles,
    current_mode: account.mode,
    onboarding_complete: true,
  };
  const existing = listed.users.find((user) => user.email === account.email);
  const result = existing
    ? await admin.auth.admin.updateUserById(existing.id, {
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: metadata,
      })
    : await admin.auth.admin.createUser({
        email: account.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: metadata,
      });
  if (result.error || !result.data.user) {
    console.error(`${account.email} 생성 실패`, result.error?.message);
    process.exitCode = 1;
    continue;
  }

  const profile = await admin.from('profiles').upsert(
    {
      id: result.data.user.id,
      name: account.name,
      email: account.email,
      role: account.role,
      roles: account.roles,
      status: 'active',
    },
    { onConflict: 'id' },
  );
  if (profile.error) {
    console.error(`${account.email} 프로필 저장 실패`, profile.error.message);
    process.exitCode = 1;
    continue;
  }
  console.log(`${account.email} 준비 완료 (${account.roles.join(', ')})`);
}
