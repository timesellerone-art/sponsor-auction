import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

const AUTH_REQUIRED_TOAST = '이 기능을 사용하려면 로그인이 필요합니다.';
const SESSION_FAIL_COPY = '로그인 정보를 확인하지 못했습니다';
const VISIBLE_SPINNER = 'main .animate-spin:visible';

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
    // .env.local이 없으면 process.env만 사용한다.
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

test.describe('실전 소셜 로그인 / 콜백 / 온보딩', () => {
  test('a) 로그인 페이지에 구글·카카오·네이버 버튼이 있다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '카카오로 계속하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '네이버로 계속하기' })).toBeVisible();
  });

  test('a) Google 로그인은 쿼리 없는 redirect_to와 PKCE verifier 쿠키로 실제 인가 서버에 간다', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    const authorize = page.waitForRequest(/\/auth\/v1\/authorize\?/);
    await page.getByRole('button', { name: 'Google로 계속하기' }).click();
    const authorizeUrl = new URL((await authorize).url());
    expect(authorizeUrl.searchParams.get('provider')).toBe('google');
    expect(authorizeUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(authorizeUrl.searchParams.get('redirect_to')).toBe('http://localhost:3000/auth/callback');

    const cookies = await context.cookies('http://localhost:3000');
    const verifier = cookies.find((cookie) => cookie.name.endsWith('-auth-token-code-verifier'));
    expect(verifier, 'PKCE code verifier 쿠키가 있어야 콜백에서 교환할 수 있다').toBeTruthy();
    expect(verifier?.path).toBe('/');
    expect(cookies.find((cookie) => cookie.name === 'sponsor-auction-oauth-next')?.value).toBe(
      encodeURIComponent('/onboarding/role-select'),
    );
    await page.waitForURL(/accounts\.google\.com/, { timeout: 20000 });
  });

  test('b) 콜백 교환 실패 시 상세 사유와 함께 /login?error=oauth_failed 로 보낸다', async ({
    page,
    request,
  }) => {
    const response = await request.fetch('/auth/callback?code=invalid-oauth-code', {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    const location = new URL(response.headers().location ?? '', 'http://localhost:3000');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('oauth_failed');
    expect(location.searchParams.get('error_description')).toBeTruthy();

    const sessionCookies = response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value)
      .filter((value) => /-auth-token=/.test(value) && !/Max-Age=0/i.test(value));
    expect(sessionCookies, '실패한 교환은 세션 쿠키를 발급하지 않는다').toHaveLength(0);

    await page.goto(location.pathname + location.search);
    await expect(page.getByText(location.searchParams.get('error_description') ?? '')).toBeVisible();
  });

  test('b) 공급자 오류(Database error saving new user)는 원인과 함께 로그인으로 보낸다', async ({
    request,
  }) => {
    const response = await request.fetch(
      '/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user',
      { maxRedirects: 0, failOnStatusCode: false },
    );
    const location = new URL(response.headers().location ?? '', 'http://localhost:3000');
    expect(location.searchParams.get('error')).toBe('oauth_failed');
    expect(location.searchParams.get('error_description')).toContain('데이터베이스 오류');
  });

  test('c) 실제 Supabase 신규 유저 세션으로 온보딩에 진입하면 실패 화면/무한 스피너가 없다', async ({
    page,
    context,
  }) => {
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 실유저 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const email = `e2e.onboarding.${Date.now()}@sponsor-auction.test`;
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name: 'E2E 온보딩' },
    });
    expect(created.error, created.error?.message).toBeNull();
    const userId = created.data.user?.id ?? '';

    try {
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      expect(link.error, link.error?.message).toBeNull();
      const tokenHash = link.data.properties?.hashed_token ?? '';
      expect(tokenHash).toBeTruthy();

      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/onboarding')}`,
      );
      await expect(page).toHaveURL(/\/onboarding\/role-select/, { timeout: 15000 });
      await expect(page.getByRole('heading', { name: /역할을 선택해 주세요/ })).toBeVisible({
        timeout: 8000,
      });
      await expect(page.getByText(SESSION_FAIL_COPY)).toHaveCount(0);
      await expect(page.getByText(AUTH_REQUIRED_TOAST)).toHaveCount(0);
      await expect(page.locator(VISIBLE_SPINNER)).toHaveCount(0);

      const authCookies = (await context.cookies('http://localhost:3000')).filter((cookie) =>
        /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name),
      );
      expect(authCookies.length).toBeGreaterThan(0);
      for (const cookie of authCookies) {
        expect(cookie.path).toBe('/');
        expect(cookie.httpOnly, '브라우저 클라이언트가 읽어야 하므로 HttpOnly가 아니어야 한다').toBe(
          false,
        );
      }

      await page.goto('/onboarding');
      await expect(page.getByRole('heading', { name: /역할을 선택해 주세요/ })).toBeVisible({
        timeout: 8000,
      });
      await expect(page.getByText(SESSION_FAIL_COPY)).toHaveCount(0);
      await expect(page.locator(VISIBLE_SPINNER)).toHaveCount(0);
    } finally {
      if (userId) {
        await admin.auth.admin.deleteUser(userId);
        await admin.from('profiles').delete().eq('id', userId);
      }
    }
  });

  test('c) 세션이 없을 때도 온보딩은 무한 스피너 없이 안내 화면으로 끝난다', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/onboarding\/role-select/);
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(VISIBLE_SPINNER)).toHaveCount(0);
    await expect(page.getByText(AUTH_REQUIRED_TOAST)).toHaveCount(0);
  });
});
