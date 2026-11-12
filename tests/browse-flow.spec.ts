import { expect, test } from '@playwright/test';
import { ADVERTISER, CREATOR, signIn } from '../e2e/helpers';

const ACTIVE_SHORTS = '여름 무알콜 맥주 숏폼 캠페인';
const ACTIVE_REELS = '비건 스킨케어 릴스 리뷰';
const CLOSED_TIKTOK = '러닝화 언박싱 틱톡 챌린지';

test.describe('역경매 검색·필터와 광고주 메인 노출', () => {
  test('크리에이터는 키워드·플랫폼·정렬로 캠페인을 찾을 수 있다', async ({ page }) => {
    await signIn(page, CREATOR);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: '진행 중인 오픈 캠페인' })).toBeVisible();
    await expect(page.locator('#auctions [aria-busy="true"]')).toHaveCount(0, { timeout: 15_000 });
    const search = page.getByRole('searchbox', { name: '캠페인 제목 또는 설명 검색' }).first();
    await expect(search).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_SHORTS })).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_REELS })).toBeVisible();

    await expect(async () => {
      await search.fill('무알콜');
      await expect(search).toHaveValue('무알콜');
    }).toPass({ timeout: 15_000 });
    await expect(page.getByRole('link', { name: ACTIVE_SHORTS })).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_REELS })).toHaveCount(0);

    await search.fill('');
    await expect(page.getByRole('button', { name: 'YouTube Shorts' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'YouTube', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Threads' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Naver Blog' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'X (Twitter)' })).toBeVisible();
    await page.getByRole('button', { name: 'YouTube Shorts' }).click();
    await expect(page.getByRole('link', { name: ACTIVE_SHORTS })).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_REELS })).toHaveCount(0);

    await page.getByRole('button', { name: '전체', exact: true }).click();
    await page.getByRole('button', { name: 'TikTok' }).click();
    await expect(page.getByRole('link', { name: CLOSED_TIKTOK })).toBeVisible();
    await expect(page.getByRole('heading', { name: '모집 마감·완료된 캠페인' })).toBeVisible();

    await page.getByRole('button', { name: '전체', exact: true }).click();
    await page.getByRole('button', { name: '높은 예산순' }).click();
    await expect(page.getByRole('link', { name: ACTIVE_SHORTS })).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_REELS })).toBeVisible();
    await expect(page.getByRole('button', { name: '콘텐츠 제안하기' }).first()).toBeVisible();
  });

  test('광고주는 메인에서 진행 중인 오픈 캠페인을 바로 확인한다', async ({ page }) => {
    await signIn(page, ADVERTISER);
    await page.goto('/');

    await expect(page.getByRole('heading', { name: '진행 중인 오픈 캠페인' })).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_SHORTS })).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_REELS })).toBeVisible();
    await expect(page.getByText('내 캠페인').first()).toBeVisible();
    await expect(page.getByRole('link', { name: '내 캠페인 제안 현황' }).first()).toBeVisible();
    await expect(page.getByText('크리에이터 전용 기능입니다')).toHaveCount(0);
  });
});
