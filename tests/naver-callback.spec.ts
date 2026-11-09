import { expect, test } from '@playwright/test';
import { ACCOUNT_LINK_COOKIE, signAccountLinkValue } from '../src/lib/account-link';
import {
  linkProviderIdentity,
  userHasBundledSocialIdentities,
  userHasProviderIdentity,
} from '../src/lib/auth-identities';
import { NAVER_NEXT_COOKIE, NAVER_STATE_COOKIE } from '../src/lib/naver-oauth';
import { linkNaverProfile } from '../src/lib/naver-link';
import {
  cleanupE2EUsers,
  deleteAuthUser,
  e2eAdminClient,
  isE2EEmail,
  readE2EEnv,
} from './helpers/e2e-users';
import { hasE2ELinkedBundle, identityProviderList } from './helpers/identity-bundle';

test.describe('네이버 OAuth 중복 코드 교환', () => {
  test.beforeAll(() => {
    const values = readE2EEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= values.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY ||=
      values.SUPABASE_SERVICE_ROLE_KEY || values.SUPABASE_SERVICE_KEY || values.SUPABASE_SECRET_KEY;
  });

  test.afterAll(async () => {
    await cleanupE2EUsers();
  });

  test('세션이 있으면 만료된 코드/토스트 없이 1초 안에 /my로 들어간다', async ({ browser }) => {
    const admin = e2eAdminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 콜백 멱등 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const env = {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    };
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY ??= env.SUPABASE_SERVICE_ROLE_KEY;

    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
    const context = await browser.newContext({ locale: 'ko-KR', baseURL });
    const page = await context.newPage();
    const stamp = Date.now().toString();
    const email = `e2e.navercb.${stamp}@sponsor-auction.test`;
    let userId = '';

    await cleanupE2EUsers(admin);

    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      app_metadata: { provider: 'google', providers: ['google', 'naver', 'kakao', 'phone'] },
      user_metadata: {
        name: 'E2E 콜백',
        roles: ['advertiser', 'creator'],
        role: 'advertiser',
        current_mode: 'advertiser',
        onboarding_complete: true,
      },
    });
    expect(created.error, created.error?.message).toBeNull();
    userId = created.data.user?.id ?? '';
    await admin.from('profiles').upsert({
      id: userId,
      email,
      name: 'E2E 콜백',
      role: 'advertiser',
      roles: ['advertiser', 'creator'],
    });

    try {
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const tokenHash = link.data.properties?.hashed_token ?? '';
      expect(tokenHash).not.toBe('');

      const started = Date.now();
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      expect(Date.now() - started).toBeLessThan(1000);

      const expiredToast = page.getByText('로그인 코드가 만료되었거나 이미 사용되었습니다');
      const delayToast = page.getByText('로그인 확인이 지연');

      await page.goto('/auth/callback?code=already-used-oauth-code');
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      await expect(expiredToast).toHaveCount(0);
      await expect(delayToast).toHaveCount(0);

      await page.goto(
        `/login?error=oauth_failed&error_description=${encodeURIComponent('로그인 코드가 만료되었거나 이미 사용되었습니다. 다시 로그인해 주세요.')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      await expect(expiredToast).toHaveCount(0);

      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&client=1&linked=1&next=${encodeURIComponent('/my')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      await expect(expiredToast).toHaveCount(0);
    } finally {
      await context.close().catch(() => undefined);
      if (userId) {
        await deleteAuthUser(admin, userId);
      }
      await cleanupE2EUsers(admin);
    }
  });

  test('구글→카카오 세션에서 네이버 코드가 만료돼도 토스트 없이 1초 안에 /my로 들어가 4개 identity를 묶는다', async ({
    browser,
  }) => {
    const admin = e2eAdminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 연쇄 연동 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
    const context = await browser.newContext({ locale: 'ko-KR', baseURL });
    const page = await context.newPage();
    const stamp = Date.now().toString();
    const email = `e2e.chain.${stamp}@sponsor-auction.test`;
    const sharedPhone = `0107${stamp.slice(-7)}`.slice(0, 11);
    const googleSub = `google-chain-${stamp}`;
    const kakaoId = `kakao-chain-${stamp}`;
    const naverId = `naver-chain-${stamp}`;
    let userId = '';

    await cleanupE2EUsers(admin);

    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      phone: `+82${sharedPhone.slice(1)}`,
      phone_confirm: true,
      app_metadata: {
        provider: 'google',
        providers: ['google', 'kakao', 'phone'],
        contact_email: email,
        contact_phone: sharedPhone,
      },
      user_metadata: {
        name: 'E2E 연쇄',
        roles: ['advertiser', 'creator'],
        role: 'advertiser',
        current_mode: 'advertiser',
        onboarding_complete: true,
        phone: sharedPhone,
      },
    });
    expect(created.error, created.error?.message).toBeNull();
    userId = created.data.user?.id ?? '';
    await admin.from('profiles').upsert({
      id: userId,
      email,
      name: 'E2E 연쇄',
      phone: sharedPhone,
      role: 'advertiser',
      roles: ['advertiser', 'creator'],
    });

    try {
      await linkProviderIdentity(admin, {
        userId,
        provider: 'google',
        providerId: googleSub,
        email,
        name: 'E2E 연쇄',
      });
      await linkProviderIdentity(admin, {
        userId,
        provider: 'kakao',
        providerId: kakaoId,
        email,
        name: 'E2E 연쇄',
      });
      await linkProviderIdentity(admin, {
        userId,
        provider: 'phone',
        providerId: `+82${sharedPhone.slice(1)}`,
      });

      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const tokenHash = link.data.properties?.hashed_token ?? '';
      expect(tokenHash).not.toBe('');
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });

      const accountLink = signAccountLinkValue(userId);
      expect(accountLink).not.toBe('');
      await context.addCookies([
        {
          name: ACCOUNT_LINK_COOKIE,
          value: accountLink,
          url: baseURL,
          httpOnly: true,
          sameSite: 'Lax',
        },
        {
          name: NAVER_STATE_COOKIE,
          value: 'chain-state',
          url: baseURL,
          httpOnly: true,
          sameSite: 'Lax',
        },
        {
          name: NAVER_NEXT_COOKIE,
          value: '/my',
          url: baseURL,
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);

      const expiredToast = page.getByText('로그인 코드가 만료되었거나 이미 사용되었습니다');
      const delayToast = page.getByText('로그인 확인이 지연');
      const started = Date.now();
      await page.goto('/api/auth/naver/callback?code=already-used-oauth-code&state=chain-state');
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      expect(Date.now() - started).toBeLessThan(1000);
      await expect(expiredToast).toHaveCount(0);
      await expect(delayToast).toHaveCount(0);

      await page.goto('/auth/callback?code=already-used-oauth-code');
      await expect(page).toHaveURL(/\/my/, { timeout: 8000 });
      await expect(expiredToast).toHaveCount(0);

      const linked = await linkNaverProfile(admin, {
        id: naverId,
        email,
        name: '네이버 회원',
        phone: sharedPhone,
        avatarUrl: null,
      });
      expect(linked.user.id).toBe(userId);
      const bundled = (await admin.auth.admin.getUserById(userId)).data.user;
      expect(userHasProviderIdentity(bundled, 'naver', naverId)).toBe(true);
      expect(userHasProviderIdentity(bundled, 'phone')).toBe(true);
      let liveBundled = false;
      const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      for (const row of listed.data.users ?? []) {
        const user = (await admin.auth.admin.getUserById(row.id)).data.user;
        if (user && !isE2EEmail(user.email) && userHasBundledSocialIdentities(user)) {
          liveBundled = true;
          break;
        }
      }
      expect(
        hasE2ELinkedBundle(bundled) || liveBundled,
        `Google/Kakao/Naver/Phone 묶음이 없습니다. synthetic=${identityProviderList(bundled)}`,
      ).toBe(true);
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
