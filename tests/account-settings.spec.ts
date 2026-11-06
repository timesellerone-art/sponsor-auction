import { expect, test } from '@playwright/test';
import { collectAuthConsoleNoise } from '../e2e/helpers';
import { linkProviderIdentity } from '../src/lib/auth-identities';
import {
  cleanupE2EUsers,
  deleteAuthUser,
  e2eAdminClient,
  isE2EEmail,
  readE2EEnv,
} from './helpers/e2e-users';

test.describe('마이페이지와 계정 설정', () => {
  test.beforeAll(() => {
    const values = readE2EEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= values.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||=
      values.SUPABASE_SERVICE_ROLE_KEY || values.SUPABASE_SERVICE_KEY || values.SUPABASE_SECRET_KEY;
  });

  test.afterAll(async () => {
    await cleanupE2EUsers();
  });

  test('연동 상태를 보여주고 회원 탈퇴하면 DB에서 사라진다', async ({ browser }) => {
    const admin = e2eAdminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 계정 설정 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
    const context = await browser.newContext({ locale: 'ko-KR', baseURL });
    const page = await context.newPage();
    const consoleNoise = collectAuthConsoleNoise(page);
    const stamp = Date.now().toString();
    const email = `e2e.account.${stamp}@sponsor-auction.test`;
    const googleSub = `google-account-${stamp}`;
    const kakaoId = `kakao-account-${stamp}`;
    let userId = '';

    await cleanupE2EUsers(admin);

    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: 'google', providers: ['google', 'kakao'] },
      user_metadata: {
        name: 'E2E 계정설정',
        roles: ['advertiser', 'creator'],
        role: 'advertiser',
        current_mode: 'advertiser',
        onboarding_complete: true,
        linked_providers: ['google', 'kakao'],
      },
    });
    expect(created.error, created.error?.message).toBeNull();
    userId = created.data.user?.id ?? '';
    await admin.from('profiles').upsert({
      id: userId,
      email,
      name: 'E2E 계정설정',
      role: 'advertiser',
      roles: ['advertiser', 'creator'],
    });

    try {
      await linkProviderIdentity(admin, {
        userId,
        provider: 'google',
        providerId: googleSub,
        email,
        name: 'E2E 계정설정',
      });
      await linkProviderIdentity(admin, {
        userId,
        provider: 'kakao',
        providerId: kakaoId,
        email,
        name: 'E2E 계정설정',
      });

      await page.goto('/login', { waitUntil: 'domcontentloaded' });
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const tokenHash = link.data.properties?.hashed_token ?? '';
      expect(tokenHash).not.toBe('');
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
        { waitUntil: 'domcontentloaded' },
      );
      await expect(page).toHaveURL((url) => url.pathname === '/my', { timeout: 20000 });
      await expect(page.getByRole('heading', { name: '내 역경매' })).toBeVisible({
        timeout: 20000,
      });
      await expect(page.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: '연동된 계정' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: '회원 탈퇴' })).toHaveCount(0);

      await page.getByRole('link', { name: '계정 설정' }).click();
      await expect(page).toHaveURL((url) => url.pathname === '/my/settings', { timeout: 8000 });
      await expect(page.getByRole('heading', { name: '계정 설정' })).toBeVisible();

      const panel = page.getByRole('heading', { name: '연동된 계정' });
      await panel.scrollIntoViewIfNeeded();
      await expect(panel).toBeVisible({ timeout: 15000 });
      await expect(page.getByText('연동 상태를 확인하는 중')).toHaveCount(0, { timeout: 15000 });
      await expect(page.getByText('Google', { exact: true })).toBeVisible();
      await expect(page.getByText('Kakao', { exact: true })).toBeVisible();
      await expect(page.getByText('Naver', { exact: true })).toBeVisible();
      await expect(page.getByText('Phone', { exact: true })).toBeVisible();
      await expect(page.getByText('연동됨').first()).toBeVisible();
      await expect(page.getByRole('button', { name: '연동하기' }).first()).toBeVisible();
      expect(consoleNoise, consoleNoise.join('\n')).toEqual([]);

      const kakaoRow = page.locator('li').filter({ hasText: 'Kakao' });
      if (await kakaoRow.getByRole('button', { name: '연동 해제' }).isEnabled()) {
        await kakaoRow.getByRole('button', { name: '연동 해제' }).click();
        await page.getByRole('dialog', { name: '연동을 해제할까요?' }).getByRole('button', { name: '연동 해제' }).click();
        await expect(kakaoRow.getByRole('button', { name: '연동하기' })).toBeVisible({ timeout: 8000 });
      }

      await page.getByRole('link', { name: '마이페이지' }).click();
      await expect(page).toHaveURL((url) => url.pathname === '/my', { timeout: 8000 });
      await expect(page.getByRole('heading', { name: '내 역경매' })).toBeVisible();
      await page.getByRole('link', { name: '계정 설정' }).click();
      await expect(page).toHaveURL((url) => url.pathname === '/my/settings');

      await page.getByRole('button', { name: '회원 탈퇴' }).click();
      await page.getByRole('dialog', { name: '정말 탈퇴할까요?' }).getByRole('button', { name: '회원 탈퇴' }).click();
      await expect(page).toHaveURL((url) => url.pathname === '/', { timeout: 15000 });

      const remaining = (await admin.auth.admin.getUserById(userId)).data.user;
      expect(remaining).toBeNull();
      const profile = await admin.from('profiles').select('id').eq('id', userId).maybeSingle();
      expect(profile.data).toBeNull();
      userId = '';
    } finally {
      await context.close().catch(() => undefined);
      if (userId) {
        await deleteAuthUser(admin, userId);
      }
      await cleanupE2EUsers(admin);
    }
  });

  test('테스트 계정은 종료 후 남지 않는다', async () => {
    const admin = e2eAdminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 정리 확인을 건너뜁니다.');
    if (!admin) {
      return;
    }
    await cleanupE2EUsers(admin);
    const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    expect((listed.data.users ?? []).some((user) => isE2EEmail(user.email))).toBe(false);
  });
});
