import { expect, test, type Locator, type Page } from '@playwright/test';

export const ADVERTISER = {
  email: 'brand@demo.com',
  password: 'demo1234',
  name: '데모 광고주',
} as const;

export const CREATOR = {
  email: 'creator@demo.com',
  password: 'demo1234',
  name: '데모 크리에이터',
} as const;

export const ADMIN = {
  email: 'admin@demo.com',
  password: 'demo1234',
  name: '데모 관리자',
} as const;

export async function isMobileNav(page: Page) {
  return page.getByRole('button', { name: '메뉴 열기' }).isVisible();
}

export async function openMobileNav(page: Page) {
  const openButton = page.getByRole('button', { name: '메뉴 열기' });
  if (await openButton.isVisible()) {
    await openButton.click();
  }
  await expect(page.getByRole('navigation', { name: '모바일' })).toBeVisible();
}

export async function closeMobileNav(page: Page) {
  const closeButton = page.getByRole('button', { name: '메뉴 닫기', expanded: true });
  if (await closeButton.isVisible()) {
    await closeButton.click();
  }
  await expect(page.getByRole('navigation', { name: '모바일' })).toBeHidden();
}

export async function acceptAgreements(scope: Page | Locator) {
  await scope.getByRole('checkbox', { name: /서비스 이용약관/ }).check();
  await scope.getByRole('checkbox', { name: /개인정보처리방침/ }).check();
}

export async function fillLoginForm(page: Page, email: string, password: string) {
  const form = page.locator('form').first();
  await expect(form).toBeVisible();
  await form.getByPlaceholder('you@example.com').fill(email);
  await form.getByPlaceholder('6자 이상').fill(password);
  return form;
}

export async function signIn(
  page: Page,
  account: { email: string; password: string; name: string },
) {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
  const form = await fillLoginForm(page, account.email, account.password);
  await form.getByRole('button', { name: '로그인' }).click();
  try {
    await expect(page).not.toHaveURL(/\/login/, { timeout: 12_000 });
  } catch {
    test.skip(true, `데모 계정(${account.email})이 없어 이 시나리오를 건너뜁니다.`);
  }

  if (await isMobileNav(page)) {
    await openMobileNav(page);
    await expect(
      page.getByRole('navigation', { name: '모바일' }).getByRole('button', { name: /로그아웃/ }),
    ).toBeVisible();
    await closeMobileNav(page);
    return;
  }

  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect(page.getByText(account.name, { exact: false })).toBeVisible();
}

export async function signOut(page: Page) {
  if (await isMobileNav(page)) {
    await openMobileNav(page);
    await page
      .getByRole('navigation', { name: '모바일' })
      .getByRole('button', { name: /로그아웃/ })
      .click();
  } else {
    await page
      .getByRole('navigation', { name: '주요' })
      .getByRole('button', { name: '로그아웃' })
      .click();
  }
  await expect(page.getByRole('link', { name: '로그인' }).first()).toBeVisible();
}

export function uniqueCampaignTitle() {
  return `E2E 매칭 캠페인 ${Date.now()}`;
}

export async function unlockAdmin(page: Page) {
  await signIn(page, ADMIN);
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toBeVisible();
  await expect(page.getByText('총 역경매 수')).toBeVisible();
}

export async function acceptNextConfirm(page: Page) {
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
}
