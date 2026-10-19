import { expect, test, type Page } from '@playwright/test';
import { ADMIN, signIn } from '../e2e/helpers';

const ACTIVE_AUCTION = '여름 무알콜 맥주 숏폼 캠페인';

const VIEWPORTS = [
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
] as const;

type OverflowReport = {
  innerWidth: number;
  scrollWidth: number;
  overflowing: Array<{ tag: string; className: string; right: number; width: number }>;
};

async function measureOverflow(page: Page): Promise<OverflowReport> {
  return page.evaluate(() => {
    const innerWidth = window.innerWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const overflowing: OverflowReport['overflowing'] = [];
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        continue;
      }
      if (rect.right > innerWidth + 0.5 || rect.left < -0.5) {
        overflowing.push({
          tag: el.tagName.toLowerCase(),
          className: typeof el.className === 'string' ? el.className.slice(0, 160) : '',
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
      if (overflowing.length >= 12) {
        break;
      }
    }
    return { innerWidth, scrollWidth, overflowing };
  });
}

async function expectNoHorizontalScroll(page: Page, label: string) {
  const report = await measureOverflow(page);
  const extra = report.overflowing
    .map((item) => `${item.tag}.${item.className} w=${item.width} right=${item.right}`)
    .join('\n');
  expect(
    report.scrollWidth,
    `${label}: scrollWidth ${report.scrollWidth} > innerWidth ${report.innerWidth}\n${extra}`,
  ).toBeLessThanOrEqual(report.innerWidth);
}

test.describe('전 페이지 가로 스크롤 0px', () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name}에서 /, /auctions, /admin 가로 스크롤이 없다`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });

      await page.goto('/');
      await expect(page.getByRole('heading', { name: '진행 중인 역경매' })).toBeVisible();
      await expectNoHorizontalScroll(page, `${viewport.name} /`);

      await page.getByRole('link', { name: ACTIVE_AUCTION }).click();
      await expect(page).toHaveURL(/\/auctions\//);
      await expect(page.getByRole('heading', { level: 1, name: ACTIVE_AUCTION })).toBeVisible();
      await expectNoHorizontalScroll(page, `${viewport.name} /auctions`);

      await signIn(page, ADMIN);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto('/admin');
      await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toBeVisible();
      await expectNoHorizontalScroll(page, `${viewport.name} /admin 역경매`);

      await page.getByRole('button', { name: '정산 관리' }).click();
      await expect(page.getByText('총 결제/입찰 금액')).toBeVisible();
      await expectNoHorizontalScroll(page, `${viewport.name} /admin 정산`);
    });
  }
});
