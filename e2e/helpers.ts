import { expect, type Locator, type Page } from '@playwright/test';

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

export const VALID_CHANNEL_URL = 'https://youtube.com/@test';

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
  await expect(
    page,
    `데모 계정(${account.email}) 로그인에 실패했습니다.`,
  ).not.toHaveURL(/\/login/, { timeout: 12_000 });

  const wantedMode =
    account.email === CREATOR.email
      ? '크리에이터 모드'
      : account.email === ADVERTISER.email
        ? '광고주 모드'
        : null;
  if (wantedMode) {
    const modeButton = page.getByRole('button', { name: wantedMode }).first();
    const modeBadge = page.locator('span').filter({ hasText: wantedMode }).first();
    await expect(modeButton.or(modeBadge)).toBeVisible({ timeout: 15_000 });
    if (await modeButton.isVisible()) {
      await modeButton.click();
      await expect(modeButton).toHaveAttribute('aria-pressed', 'true');
    }
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

export async function openCreateAuction(page: Page) {
  await page.goto('/');
  const advertiserMode = page.getByRole('button', { name: '광고주 모드' }).first();
  const advertiserBadge = page.locator('span').filter({ hasText: '광고주 모드' }).first();
  await expect(advertiserMode.or(advertiserBadge)).toBeVisible({ timeout: 15_000 });
  if (await advertiserMode.isVisible()) {
    await advertiserMode.click();
    await expect(advertiserMode).toHaveAttribute('aria-pressed', 'true');
  }

  const desktopNav = page.getByRole('navigation', { name: '주요' });
  const useDesktop = await desktopNav.isVisible();
  const createButton = useDesktop
    ? desktopNav.getByRole('button', { name: '캠페인 등록' })
    : page.getByRole('button', { name: '캠페인 등록' }).first();
  await expect(createButton).toBeEnabled({ timeout: 15_000 });

  const dialog = page.getByRole('dialog', { name: '캠페인 등록' });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await dialog.isVisible()) {
      break;
    }
    await createButton.click();
    try {
      await expect(dialog).toBeVisible({ timeout: 3_000 });
      break;
    } catch {
      // 인증 하이드레이션·오버레이 지연이면 한 번 더 연다.
    }
  }
  await expect(dialog).toBeVisible({ timeout: 12_000 });
  return dialog;
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
  await expect(page.getByText('총 캠페인 수')).toBeVisible();
}

export async function acceptNextConfirm(page: Page) {
  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
}

const AUTH_CONSOLE_NOISE =
  /CHANNEL_ERROR|연동 계정 조회|로그인이 필요합니다|Failed to load resource:.*401/;

export function collectAuthConsoleNoise(page: Page) {
  const messages: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (AUTH_CONSOLE_NOISE.test(text)) {
      messages.push(`${msg.type()}: ${text}`);
    }
  });
  page.on('pageerror', (error) => {
    if (AUTH_CONSOLE_NOISE.test(error.message)) {
      messages.push(`pageerror: ${error.message}`);
    }
  });
  return messages;
}
