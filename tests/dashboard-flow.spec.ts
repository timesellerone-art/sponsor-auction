import { expect, test } from '@playwright/test';
import { ADVERTISER, CREATOR, signIn } from '../e2e/helpers';

test.describe('마이페이지 대시보드', () => {
  test('광고주는 결제 완료 캠페인을 completed 상태로 본다', async ({ page }) => {
    await signIn(page, ADVERTISER);
    await page.goto('/my');
    await expect(page.getByRole('heading', { name: '내 역경매' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '결제 완료 목록' })).toBeVisible();
    await expect(page.getByRole('link', { name: '핀테크 앱 X 스레드 체험단' }).first()).toBeVisible();
    await expect(page.getByText('결제 완료').first()).toBeVisible();
  });

  test('크리에이터는 selected 입찰을 낙찰/결제 완료로 본다', async ({ page }) => {
    await signIn(page, CREATOR);
    await page.goto('/my');
    await expect(page.getByRole('heading', { name: '내 제안' })).toBeVisible();
    await expect(page.getByRole('link', { name: '핀테크 앱 X 스레드 체험단' }).first()).toBeVisible();
    await expect(page.getByText('낙찰/결제 완료').first()).toBeVisible();
  });

  test('크리에이터는 pending 입찰을 진행 중인 제안에서 본다', async ({ page }) => {
    await signIn(page, CREATOR);
    await page.goto('/my');
    await expect(page.getByRole('heading', { name: '진행 중인 제안(입찰 중)' })).toBeVisible();
    await expect(page.getByText('여름 무알콜 맥주 숏폼 캠페인')).toBeVisible();
    await expect(page.getByText('제안 대기').first()).toBeVisible();
  });
});
