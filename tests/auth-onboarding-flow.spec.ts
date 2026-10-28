import { expect, test } from '@playwright/test';
import { AUTH_PRESENT_COOKIE_NAME } from '../src/lib/access';

test.describe('소셜 로그인 온보딩 세션 가드', () => {
  test('온보딩에서 세션이 없어도 auth-required 토스트로 튕기지 않는다', async ({ page }) => {
    await page.goto('/onboarding/role-select');
    await page.waitForTimeout(2500);
    await expect(
      page.getByText('이 기능을 사용하려면 로그인이 필요합니다.'),
    ).toHaveCount(0);
  });

  test('login?reason=auth-required&next=온보딩 은 해당 토스트를 띄우지 않는다', async ({
    page,
  }) => {
    await page.goto('/login?reason=auth-required&next=/onboarding/role-select');
    await expect(page.getByRole('heading', { name: /로그인|회원가입/ })).toBeVisible();
    await expect(
      page.getByText('이 기능을 사용하려면 로그인이 필요합니다.'),
    ).toHaveCount(0);
  });

  test('auth present 쿠키가 있으면 로그인 페이지에서 온보딩으로 보낸다', async ({
    context,
    page,
  }) => {
    await context.addCookies([
      {
        name: AUTH_PRESENT_COOKIE_NAME,
        value: '1',
        url: 'http://localhost:3000',
      },
    ]);
    await page.goto('/login?reason=auth-required&next=/onboarding/role-select');
    await expect(page).toHaveURL(/\/onboarding\/role-select|\/login/);
    await expect(
      page.getByText('이 기능을 사용하려면 로그인이 필요합니다.'),
    ).toHaveCount(0);
  });

  test('소셜 로그인 버튼이 로그인 페이지에 있다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '카카오로 계속하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '네이버로 계속하기' })).toBeVisible();
  });
});
