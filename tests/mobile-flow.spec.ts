import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  ADMIN,
  ADVERTISER,
  CREATOR,
  closeMobileNav,
  openMobileNav,
  signIn,
} from '../e2e/helpers';

const ACTIVE_AUCTION = '여름 무알콜 맥주 숏폼 캠페인';

test.describe('모바일 반응형 UI', () => {
  test.beforeEach(async ({ page }) => {
    const viewport = page.viewportSize();
    expect(viewport).toBeTruthy();
    expect(viewport!.width).toBeLessThanOrEqual(430);
  });

  test('모바일에서 역경매 목록과 메뉴가 잘리지 않고 터치된다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /광고주는 예산을 올리고/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: '진행 중인 역경매' })).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_AUCTION })).toBeVisible();

    await expectInViewportHorizontally(page.getByRole('link', { name: 'SponsorAuction' }));
    await expectInViewportHorizontally(page.getByRole('button', { name: '역경매 등록' }).first());
    await expectInViewportHorizontally(page.getByRole('button', { name: '메뉴 열기' }));
    await expectNoPageHorizontalOverflow(page);

    await openMobileNav(page);
    const mobileNav = page.getByRole('navigation', { name: '모바일' });
    await expect(mobileNav.getByRole('link', { name: '역경매 둘러보기' })).toBeVisible();
    await expect(mobileNav.getByRole('link', { name: '로그인' })).toBeVisible();
    await expectInViewportHorizontally(mobileNav);
    await closeMobileNav(page);

    await page.getByRole('link', { name: ACTIVE_AUCTION }).click();
    await expect(page).toHaveURL(/\/auctions\//);
    await expect(page.getByRole('heading', { level: 1, name: ACTIVE_AUCTION })).toBeVisible();
  });

  test('모바일 상세 페이지와 제안서 모달이 겹치지 않고 조작된다', async ({ page }) => {
    await signIn(page, CREATOR);
    await page.goto('/');
    await page.getByRole('link', { name: ACTIVE_AUCTION }).click();
    await expect(page).toHaveURL(/\/auctions\//);

    const heading = page.getByRole('heading', { level: 1, name: ACTIVE_AUCTION });
    await expect(heading).toBeVisible();
    await expectInViewportHorizontally(heading);
    await expectNoPageHorizontalOverflow(page);

    const bidButton = page.getByRole('button', { name: '제안하기' });
    await expect(bidButton).toBeVisible();
    await expectInViewportHorizontally(bidButton);
    await bidButton.click();

    const bidDialog = page.getByRole('dialog', { name: '제안하기' });
    await expect(bidDialog).toBeVisible();
    await expectDialogFitsViewport(page, bidDialog);

    await bidDialog.getByLabel('제안 금액(단가)').fill('120000');
    await bidDialog
      .getByLabel('제안 내용/소개글')
      .fill('모바일 뷰포트에서 제안 모달 입력과 스크롤이 동작하는지 확인합니다.');
    await expect(bidDialog.getByRole('button', { name: '제안 제출' })).toBeVisible();
    await expectInViewportHorizontally(bidDialog.getByRole('button', { name: '제안 제출' }));

    await bidDialog.getByRole('button', { name: '닫기' }).click();
    await expect(bidDialog).toBeHidden();
    await expect(heading).toBeVisible();
  });

  test('모바일에서 역경매 등록 모달이 뷰포트 안에 표시된다', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: '역경매 등록' }).first().click();
    await expect(page).toHaveURL(/\/login/);

    await signIn(page, ADVERTISER);
    await page.goto('/');
    await page.getByRole('button', { name: '역경매 등록' }).first().click();

    const createDialog = page.getByRole('dialog', { name: '역경매 요청하기' });
    await expect(createDialog).toBeVisible();
    await expectDialogFitsViewport(page, createDialog);
    await expect(createDialog.getByLabel('제목')).toBeVisible();
    await expect(createDialog.getByLabel('예산')).toBeVisible();
    await expect(createDialog.getByRole('button', { name: '역경매 등록' })).toBeVisible();
    await createDialog.getByRole('button', { name: '닫기' }).click();
    await expect(createDialog).toBeHidden();
  });

  test('모바일 관리자 대시보드 탭과 목록이 잘리지 않고 동작한다', async ({ page }) => {
    await signIn(page, ADMIN);
    await openMobileNav(page);
    await page.getByRole('navigation', { name: '모바일' }).getByRole('link', { name: '관리자' }).click();
    await expect(page).toHaveURL(/\/admin/);

    await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toBeVisible();
    await expect(page.getByText('총 역경매 수')).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
    await expectInViewportHorizontally(page.getByRole('heading', { name: '관리자 대시보드' }));

    const auctionsTab = page.getByRole('button', { name: '역경매 관리' });
    await expect(auctionsTab).toBeVisible();
    await auctionsTab.click();
    await expect(page.getByRole('link', { name: ACTIVE_AUCTION })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '제목' })).toBeVisible();

    await page.getByRole('button', { name: '회원 관리' }).click();
    await expect(page.getByRole('columnheader', { name: '이름/이메일' })).toBeVisible();

    await page.getByRole('button', { name: '역경매 관리' }).click();
    await page.getByPlaceholder('캠페인 제목, 설명, 광고주 이름/이메일 검색').fill(ACTIVE_AUCTION);
    await expect(page.getByRole('link', { name: ACTIVE_AUCTION })).toBeVisible();
    await expectNoPageHorizontalOverflow(page);
  });
});

async function expectNoPageHorizontalOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const innerWidth = window.innerWidth;
    return {
      innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 2);
}

async function expectInViewportHorizontally(locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const viewport = locator.page().viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(-2);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 2);
}

async function expectDialogFitsViewport(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  expect(box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.x).toBeGreaterThanOrEqual(-2);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 2);
  expect(box!.height).toBeLessThanOrEqual(viewport!.height + 2);
}
