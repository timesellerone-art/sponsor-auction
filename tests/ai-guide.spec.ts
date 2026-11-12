import { expect, test } from '@playwright/test';
import { CREATOR, signIn } from '../e2e/helpers';

const ACTIVE_SHORTS = '여름 무알콜 맥주 숏폼 캠페인';

test.describe('캠페인 AI 가이드', () => {
  test('상세 페이지에서 가이드 카드와 추천 리포트가 표시된다', async ({ page }) => {
    await signIn(page, CREATOR);
    await page.goto('/');
    await expect(page.getByRole('link', { name: ACTIVE_SHORTS })).toBeVisible();
    await page.getByRole('link', { name: ACTIVE_SHORTS }).click();

    await expect(page.getByRole('heading', { name: 'AI 에이전트 가이드' })).toBeVisible();
    await expect(page.getByText('AI 맞춤 분석 리포트')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('콘셉트 1').first()).toBeVisible();
    await expect(page.getByText('캠페인 핵심 전략', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('AI가 캠페인 맞춤 가이드를 분석 중입니다...')).toHaveCount(0);
  });
});
