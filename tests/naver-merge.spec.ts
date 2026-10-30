import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type BrowserContext } from '@playwright/test';
import { linkNaverProfile, userHasNaverIdentity } from '../src/lib/naver-link';

function readEnv() {
  const values: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index <= 0 || line.trim().startsWith('#')) {
        continue;
      }
      const key = line.slice(0, index).trim();
      values[key] ??= line.slice(index + 1).trim().replace(/^"|"$/g, '');
    }
  } catch {
    // process.env만 사용한다.
  }
  return values;
}

function adminClient(): SupabaseClient | null {
  const env = readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sessionUserId(context: BrowserContext): Promise<string | null> {
  const chunks = (await context.cookies('http://localhost:3000'))
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((left, right) => left.name.localeCompare(right.name, 'en', { numeric: true }));
  const raw = chunks.map((cookie) => cookie.value).join('');
  if (!raw) {
    return null;
  }
  const json = raw.startsWith('base64-')
    ? Buffer.from(raw.slice('base64-'.length), 'base64url').toString('utf8')
    : decodeURIComponent(raw);
  const session = JSON.parse(json) as { user?: { id?: string } };
  return session.user?.id ?? null;
}

async function deleteMatchingUsers(admin: SupabaseClient, matches: (email: string) => boolean) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const user of listed.data.users ?? []) {
    const email = user.email ?? '';
    if (!matches(email)) {
      continue;
    }
    await admin.auth.admin.deleteUser(user.id);
    await admin.from('profiles').delete().eq('id', user.id);
  }
}

test.describe('네이버 로그인 즉시 계정 병합', () => {
  test('구글 계정과 같은 이메일·전화의 네이버 로그인은 한 UID로 /my에 들어간다', async ({
    page,
    context,
  }) => {
    const env = readEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY ??=
      env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 네이버 병합 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const stamp = Date.now().toString();
    const googleEmail = `e2e.navermerge.${stamp}@sponsor-auction.test`;
    const sharedPhone = `0106${stamp.slice(-7)}`.slice(0, 11);
    const naverEmailId = `naver-${stamp}`;
    const naverPhoneId = `naver-phone-${stamp}`;
    await deleteMatchingUsers(
      admin,
      (email) =>
        email === 'e2e.roleswitch.browser@sponsor-auction.test' ||
        email.startsWith('e2e.navermerge.') ||
        email.startsWith('naver.e2e.'),
    );

    const google = await admin.auth.admin.createUser({
      email: googleEmail,
      email_confirm: true,
      phone: `+82${sharedPhone.slice(1)}`,
      phone_confirm: true,
      app_metadata: {
        provider: 'google',
        providers: ['google'],
        contact_email: googleEmail,
        contact_phone: sharedPhone,
      },
      user_metadata: {
        name: 'E2E 구글',
        roles: ['advertiser', 'creator'],
        role: 'advertiser',
        current_mode: 'advertiser',
        onboarding_complete: true,
        phone: sharedPhone,
      },
    });
    expect(google.error, google.error?.message).toBeNull();
    const googleId = google.data.user?.id ?? '';
    await admin.from('profiles').upsert({
      id: googleId,
      email: googleEmail,
      name: 'E2E 구글',
      phone: sharedPhone,
      role: 'advertiser',
      roles: ['advertiser', 'creator'],
    });

    const stubEmail = `naver.${naverPhoneId}@oauth.sponsor-auction.local`;
    const stub = await admin.auth.admin.createUser({
      email: stubEmail,
      email_confirm: true,
      app_metadata: {
        provider: 'naver',
        providers: ['naver'],
        naver_ids: [naverPhoneId],
        contact_phone: sharedPhone,
      },
      user_metadata: { name: 'E2E 네이버 스텁', naver_id: naverPhoneId, phone: sharedPhone },
    });
    const stubId = stub.data.user?.id ?? '';
    if (stubId) {
      await admin.from('profiles').upsert({
        id: stubId,
        email: stubEmail,
        name: 'E2E 네이버 스텁',
        role: null,
        roles: [],
      });
    }

    try {
      const mergeStarted = Date.now();
      const byEmail = await linkNaverProfile(admin, {
        id: naverEmailId,
        email: googleEmail,
        name: '네이버 회원',
        phone: null,
        avatarUrl: null,
      });
      expect(byEmail.user.id).toBe(googleId);
      expect(byEmail.merged).toBe(true);
      expect(Date.now() - mergeStarted).toBeLessThan(1000);

      const byPhone = await linkNaverProfile(admin, {
        id: naverPhoneId,
        email: stubEmail,
        name: '네이버 전화',
        phone: sharedPhone,
        avatarUrl: null,
      });
      expect(byPhone.user.id).toBe(googleId);
      expect(byPhone.merged).toBe(true);
      if (stubId) {
        expect((await admin.auth.admin.getUserById(stubId)).data.user).toBeNull();
      }
      const mergedUser = (await admin.auth.admin.getUserById(googleId)).data.user;
      expect(mergedUser?.app_metadata?.naver_ids).toEqual(
        expect.arrayContaining([naverEmailId, naverPhoneId]),
      );
      expect(mergedUser?.app_metadata?.providers).toEqual(expect.arrayContaining(['naver']));
      const identityRpc = await admin.rpc('link_naver_identity', {
        p_user_id: googleId,
        p_naver_id: naverEmailId,
        p_email: googleEmail,
        p_name: 'E2E 구글',
      });
      if (identityRpc.error?.code === 'PGRST202') {
        expect(mergedUser?.app_metadata?.providers).toEqual(expect.arrayContaining(['naver']));
      } else {
        expect(identityRpc.error, identityRpc.error?.message).toBeNull();
        await admin.rpc('link_naver_identity', {
          p_user_id: googleId,
          p_naver_id: naverPhoneId,
          p_email: googleEmail,
          p_name: 'E2E 구글',
        });
        const withIdentities = (await admin.auth.admin.getUserById(googleId)).data.user;
        expect(userHasNaverIdentity(withIdentities, naverEmailId)).toBe(true);
        expect(userHasNaverIdentity(withIdentities, naverPhoneId)).toBe(true);
      }

      const delayToast = page.getByText('로그인 확인이 지연');
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: googleEmail });
      const tokenHash = link.data.properties?.hashed_token ?? '';
      const started = Date.now();
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 3000 });
      expect(Date.now() - started).toBeLessThan(1000);
      await expect(delayToast).toHaveCount(0);
      await expect(page.getByRole('heading', { name: '이미 가입된 계정이 있습니다' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: /역할을 선택해 주세요/ })).toHaveCount(0);
      expect(await sessionUserId(context)).toBe(googleId);
    } finally {
      for (const id of [stubId, googleId]) {
        if (id) {
          await admin.auth.admin.deleteUser(id);
          await admin.from('profiles').delete().eq('id', id);
        }
      }
      await deleteMatchingUsers(
        admin,
        (email) =>
          email === googleEmail || email === stubEmail || email.startsWith(`naver.e2e.${stamp}`),
      );
    }
  });
});
