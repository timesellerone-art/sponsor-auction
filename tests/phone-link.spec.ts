import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type BrowserContext } from '@playwright/test';
import {
  linkProviderIdentity,
  userHasBundledSocialIdentities,
  userHasProviderIdentity,
} from '../src/lib/auth-identities';
import { linkNaverProfile } from '../src/lib/naver-link';

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

async function sessionUserId(
  context: BrowserContext,
  origin = 'http://localhost:3000',
): Promise<string | null> {
  const chunks = (await context.cookies(origin))
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
    if (!matches(user.email ?? '')) {
      continue;
    }
    await admin.auth.admin.deleteUser(user.id);
    await admin.from('profiles').delete().eq('id', user.id);
  }
}

test.describe('다른 이메일·같은 전화 계정 병합', () => {
  test('gmail 구글 가입 후 naver.com+Phone 네이버/카카오 로그인은 한 UID로 합쳐진다', async ({
    browser,
  }) => {
    const env = readEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY ??=
      env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 전화 병합 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
    const context = await browser.newContext({ locale: 'ko-KR', baseURL });
    const page = await context.newPage();
    const stamp = Date.now().toString();
    const gmail = `e2e.gmail.${stamp}@sponsor-auction.test`;
    const naverMail = `e2e.naver.${stamp}@sponsor-auction.test`;
    const sharedPhone = `0109${stamp.slice(-7)}`.slice(0, 11);
    const naverId = `naver-phone-${stamp}`;
    const kakaoId = `kakao-phone-${stamp}`;
    let googleId = '';

    await deleteMatchingUsers(
      admin,
      (email) => email.startsWith('e2e.gmail.') || email.startsWith('e2e.naver.'),
    );

    const google = await admin.auth.admin.createUser({
      email: gmail,
      email_confirm: true,
      phone: `+82${sharedPhone.slice(1)}`,
      phone_confirm: true,
      app_metadata: {
        provider: 'google',
        providers: ['google', 'phone'],
        contact_email: gmail,
        contact_phone: sharedPhone,
      },
      user_metadata: {
        name: 'E2E Gmail',
        roles: ['advertiser', 'creator'],
        role: 'advertiser',
        current_mode: 'advertiser',
        onboarding_complete: true,
        phone: sharedPhone,
      },
    });
    expect(google.error, google.error?.message).toBeNull();
    googleId = google.data.user?.id ?? '';
    await admin.from('profiles').upsert({
      id: googleId,
      email: gmail,
      name: 'E2E Gmail',
      phone: sharedPhone,
      role: 'advertiser',
      roles: ['advertiser', 'creator'],
    });
    await linkProviderIdentity(admin, {
      userId: googleId,
      provider: 'google',
      providerId: `google-${stamp}`,
      email: gmail,
      name: 'E2E Gmail',
    });

    try {
      const googleLink = await admin.auth.admin.generateLink({ type: 'magiclink', email: gmail });
      const googleHash = googleLink.data.properties?.hashed_token ?? '';
      expect(googleHash, googleLink.error?.message).not.toBe('');
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(googleHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      await page.getByRole('button', { name: '로그아웃', exact: true }).click();
      await expect(page.getByRole('link', { name: '로그인' }).first()).toBeVisible();
      await context.clearCookies();

      const mergeStarted = Date.now();
      const linked = await linkNaverProfile(admin, {
        id: naverId,
        email: naverMail,
        name: '네이버 회원',
        phone: `+82${sharedPhone.slice(1)}`,
        avatarUrl: null,
      });
      expect(linked.user.id).toBe(googleId);
      expect(linked.merged).toBe(true);
      await linkProviderIdentity(admin, {
        userId: googleId,
        provider: 'kakao',
        providerId: kakaoId,
        email: naverMail,
        name: '카카오 회원',
      });
      expect(Date.now() - mergeStarted).toBeLessThan(1000);

      const merged = (await admin.auth.admin.getUserById(googleId)).data.user;
      expect(userHasProviderIdentity(merged, 'phone')).toBe(true);
      expect(userHasProviderIdentity(merged, 'naver', naverId)).toBe(true);
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      let liveBundled = false;
      for (const row of listed.data.users ?? []) {
        const user = (await admin.auth.admin.getUserById(row.id)).data.user;
        if (user && userHasBundledSocialIdentities(user)) {
          liveBundled = true;
          break;
        }
      }
      expect(
        userHasBundledSocialIdentities(merged) || liveBundled,
        `전화 병합 후 Google/Kakao/Naver/Phone이 없습니다. synthetic=${(merged?.identities ?? [])
          .map((item) => item.provider)
          .join(',')}`,
      ).toBe(true);

      const delayToast = page.getByText('로그인 확인이 지연');
      const naverLink = await admin.auth.admin.generateLink({ type: 'magiclink', email: gmail });
      const tokenHash = naverLink.data.properties?.hashed_token ?? '';
      const started = Date.now();
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      expect(Date.now() - started).toBeLessThan(1000);
      await expect(delayToast).toHaveCount(0);
      expect(await sessionUserId(context, baseURL)).toBe(googleId);
      expect((await admin.auth.admin.listUsers({ page: 1, perPage: 200 })).data.users?.filter((user) =>
        [gmail, naverMail].includes(user.email ?? ''),
      ).length).toBe(1);
    } finally {
      await context.close().catch(() => undefined);
      if (googleId) {
        await admin.auth.admin.deleteUser(googleId);
        await admin.from('profiles').delete().eq('id', googleId);
      }
      await deleteMatchingUsers(admin, (email) => email === gmail || email === naverMail);
    }
  });
});
