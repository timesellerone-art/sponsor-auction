import { expect, test } from '@playwright/test';

const AUTH_REQUIRED_TOAST = '이 기능을 사용하려면 로그인이 필요합니다.';
const SESSION_FAIL_COPY = '로그인 정보를 확인하지 못했습니다';

test.describe('실전 소셜 로그인 / 콜백 / 온보딩', () => {
  test('로그인 페이지에 구글·카카오·네이버 버튼이 있다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '카카오로 계속하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '네이버로 계속하기' })).toBeVisible();
  });

  test('Google 로그인은 실제 OAuth 인가 서버로 이동한다', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Google로 계속하기' }).click();
    await page.waitForURL(/accounts\.google\.com|supabase\.co\/auth/, { timeout: 20000 });
  });

  test('OAuth 콜백은 리다이렉트 응답 헤더로 세션 쿠키를 주입한다', async ({ page, request }) => {
    const response = await request.fetch(
      '/auth/callback?code=invalid-oauth-code&next=/onboarding/role-select',
      { maxRedirects: 0, failOnStatusCode: false },
    );
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    const location = response.headers().location ?? '';
    expect(location).toMatch(/\/auth\/oauth|\/login|\/onboarding/);

    const cookies = response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value);
    for (const value of cookies) {
      if (/sb-access-token|sb-refresh-token|-auth-token/i.test(value)) {
        expect(value, '세션 쿠키는 Path=/ 로 주입되어야 합니다').toMatch(/Path=\//i);
      }
    }

    await page.goto('/auth/callback?code=invalid-oauth-code&next=/onboarding/role-select');
    await expect(page.getByText(AUTH_REQUIRED_TOAST)).toHaveCount(0);
  });

  test('온보딩 진입 시 로그인 필요 토스트로 튕기지 않는다', async ({ page }) => {
    await page.goto('/onboarding/role-select');
    await expect(page).toHaveURL(/\/onboarding\/role-select/);
    await page.waitForTimeout(1200);
    await expect(page.getByText(AUTH_REQUIRED_TOAST)).toHaveCount(0);
  });

  test('온보딩에서 무한 스피너에 갇히지 않는다', async ({ page }) => {
    await page.goto('/onboarding/role-select');
    await expect(page.getByText(SESSION_FAIL_COPY)).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
    await expect(page.getByRole('link', { name: '로그인으로' })).toBeVisible();
    await expect(page.locator('.animate-spin')).toHaveCount(0);
    await expect(page.getByText(AUTH_REQUIRED_TOAST)).toHaveCount(0);
  });

  test('세션이 없으면 확인 실패 화면이 스피너 대신 나타난다', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/onboarding\/role-select/);
    await expect(page.getByText(SESSION_FAIL_COPY)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(AUTH_REQUIRED_TOAST)).toHaveCount(0);
  });
});
