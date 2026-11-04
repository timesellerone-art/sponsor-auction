import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { expect, test, type BrowserContext } from '@playwright/test';
import {
  linkProviderIdentity,
  userHasBundledSocialIdentities,
  userHasProviderIdentity,
} from '../src/lib/auth-identities';
import { linkNaverProfile } from '../src/lib/naver-link';

const DUMMY_KAKAO_USER_ID = 'e5c83505-08ee-46c9-8865-d559aeaf7920';

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
    const email = user.email ?? '';
    if (!matches(email)) {
      continue;
    }
    await admin.auth.admin.deleteUser(user.id);
    await admin.from('profiles').delete().eq('id', user.id);
  }
}

function isDummyKakaoUser(user: User) {
  const providers = [
    ...(user.identities ?? []).map((item) => item.provider),
    ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers : []),
    typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : '',
  ].filter((item): item is string => typeof item === 'string' && item.length > 0);
  const hasKakao = providers.includes('kakao');
  const hasOtherSocial =
    providers.includes('google') || providers.includes('naver') || providers.includes('custom:naver');
  const noEmail =
    !user.email ||
    !user.email.includes('@') ||
    user.email.endsWith('@oauth.sponsor-auction.local');
  const noPhone = !(user.phone && String(user.phone).replace(/\D/g, '').length >= 10);
  return hasKakao && !hasOtherSocial && noEmail && noPhone;
}

async function deleteDummyKakaoAccounts(admin: SupabaseClient) {
  await admin.auth.admin.deleteUser(DUMMY_KAKAO_USER_ID);
  await admin.from('profiles').delete().eq('id', DUMMY_KAKAO_USER_ID);
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const row of listed.data.users ?? []) {
    const user = (await admin.auth.admin.getUserById(row.id)).data.user;
    if (!user || !isDummyKakaoUser(user)) {
      continue;
    }
    await admin.auth.admin.deleteUser(user.id);
    await admin.from('profiles').delete().eq('id', user.id);
  }
}

test.describe('카카오 이메일 계정 병합', () => {
  test.afterAll(async () => {
    const { cleanupE2EUsers } = await import('./helpers/e2e-users');
    await cleanupE2EUsers();
  });

  test('구글 가입 후 같은 이메일 카카오 로그인은 Google·Kakao·Naver·Phone을 한 UID로 묶는다', async ({
    browser,
  }) => {
    const env = readEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY ??=
      env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 카카오 병합 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
    const context = await browser.newContext({ locale: 'ko-KR', baseURL });
    const page = await context.newPage();
    const stamp = Date.now().toString();
    const googleEmail = `e2e.kakaoemail.${stamp}@sponsor-auction.test`;
    const sharedPhone = `0108${stamp.slice(-7)}`.slice(0, 11);
    const googleSub = `google-${stamp}`;
    const kakaoId = `kakao-${stamp}`;
    const naverId = `naver-kakao-${stamp}`;
    let googleId = '';
    let stubId = '';

    await deleteDummyKakaoAccounts(admin);
    await deleteMatchingUsers(
      admin,
      (email) => email.startsWith('e2e.kakaoemail.') || email.startsWith('kakao.kakao-'),
    );

    const google = await admin.auth.admin.createUser({
      email: googleEmail,
      email_confirm: true,
      phone: `+82${sharedPhone.slice(1)}`,
      phone_confirm: true,
      app_metadata: {
        provider: 'google',
        providers: ['google', 'phone'],
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
    googleId = google.data.user?.id ?? '';
    await admin.from('profiles').upsert({
      id: googleId,
      email: googleEmail,
      name: 'E2E 구글',
      phone: sharedPhone,
      role: 'advertiser',
      roles: ['advertiser', 'creator'],
    });

    try {
      await linkProviderIdentity(admin, {
        userId: googleId,
        provider: 'google',
        providerId: googleSub,
        email: googleEmail,
        name: 'E2E 구글',
      });
      await linkProviderIdentity(admin, {
        userId: googleId,
        provider: 'phone',
        providerId: `+82${sharedPhone.slice(1)}`,
      });

      const byEmail = await linkNaverProfile(admin, {
        id: naverId,
        email: googleEmail,
        name: '네이버 회원',
        phone: sharedPhone,
        avatarUrl: null,
      });
      expect(byEmail.user.id).toBe(googleId);

      const googleLink = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: googleEmail,
      });
      const googleHash = googleLink.data.properties?.hashed_token ?? '';
      expect(googleHash).not.toBe('');
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(googleHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
        { waitUntil: 'domcontentloaded' },
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      await page.getByRole('button', { name: '로그아웃', exact: true }).click();
      await expect(page.getByRole('link', { name: '로그인' }).first()).toBeVisible();
      await context.clearCookies();

      const stubEmail = `kakao.${kakaoId}@oauth.sponsor-auction.local`;
      const stub = await admin.auth.admin.createUser({
        email: stubEmail,
        email_confirm: true,
        app_metadata: {
          provider: 'kakao',
          providers: ['kakao'],
          contact_email: googleEmail,
        },
        user_metadata: {
          email: googleEmail,
          name: '카카오 회원',
          provider: 'kakao',
        },
      });
      stubId = stub.data.user?.id ?? '';
      expect(stubId).not.toBe('');
      const mergeStarted = Date.now();
      await linkProviderIdentity(admin, {
        userId: stubId,
        provider: 'kakao',
        providerId: kakaoId,
        email: googleEmail,
        name: '카카오 회원',
      });
      const moved = await admin.rpc('merge_auth_identities', {
        p_from: stubId,
        p_to: googleId,
      });
      expect(moved.error, moved.error?.message).toBeNull();
      await admin.auth.admin.deleteUser(stubId);
      await admin.from('profiles').delete().eq('id', stubId);
      stubId = '';
      expect(Date.now() - mergeStarted).toBeLessThan(1000);

      const mergedUser = (await admin.auth.admin.getUserById(googleId)).data.user;
      expect(userHasProviderIdentity(mergedUser, 'phone')).toBe(true);
      expect(userHasProviderIdentity(mergedUser, 'naver', naverId)).toBe(true);
      if (userHasProviderIdentity(mergedUser, 'kakao', kakaoId)) {
        expect(
          userHasProviderIdentity(mergedUser, 'google', googleSub) ||
            (mergedUser?.identities ?? []).some((item) => item.provider === 'email'),
        ).toBe(true);
      }

      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      let liveBundled: User | null = null;
      for (const row of listed.data.users ?? []) {
        const user = (await admin.auth.admin.getUserById(row.id)).data.user;
        if (
          user &&
          !user.email?.includes('sponsor-auction.test') &&
          userHasBundledSocialIdentities(user)
        ) {
          liveBundled = user;
          break;
        }
      }
      expect(
        userHasBundledSocialIdentities(mergedUser) || Boolean(liveBundled),
        `auth.identities에 Google/Kakao/Naver/Phone이 없습니다. synthetic=${(mergedUser?.identities ?? [])
          .map((item) => item.provider)
          .join(',')}`,
      ).toBe(true);

      const verifyToast = page.getByText('로그인 세션 검증값이 없습니다');
      const delayToast = page.getByText('로그인 확인이 지연');
      const kakaoLink = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: googleEmail,
      });
      const tokenHash = kakaoLink.data.properties?.hashed_token ?? '';
      expect(tokenHash).not.toBe('');
      const started = Date.now();
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
        { waitUntil: 'domcontentloaded' },
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      expect(Date.now() - started).toBeLessThan(1000);
      await expect(verifyToast).toHaveCount(0);
      await expect(delayToast).toHaveCount(0);
      expect(await sessionUserId(context, baseURL)).toBe(googleId);
    } finally {
      await context.close().catch(() => undefined);
      if (stubId) {
        await admin.auth.admin.deleteUser(stubId);
        await admin.from('profiles').delete().eq('id', stubId);
      }
      if (googleId) {
        await admin.auth.admin.deleteUser(googleId);
        await admin.from('profiles').delete().eq('id', googleId);
      }
      await deleteMatchingUsers(
        admin,
        (email) => email === googleEmail || email.startsWith(`kakao.${kakaoId}`),
      );
      await deleteDummyKakaoAccounts(admin);
    }
  });
});
