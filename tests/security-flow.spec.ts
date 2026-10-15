import { expect, test } from '@playwright/test';
import { ADVERTISER, CREATOR, signIn } from '../e2e/helpers';

const PREPARE_BODY = {
  auctionId: 'auc-001',
  bidId: 'bid-001',
  amount: 1078000,
  orderName: '보안 테스트 주문',
  customerKey: 'guest-advertiser',
};

const CONFIRM_BODY = {
  paymentKey: 'demo_unauthorized',
  orderId: 'ord_unauthorized_1',
  amount: 1078000,
  auctionId: 'auc-001',
  bidId: 'bid-001',
};

test.describe('보안 접근 제어', () => {
  test('비회원은 대시보드와 결제 결과 페이지에 접근할 수 없다', async ({ page }) => {
    await page.goto('/my');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
    await expect(page.getByText('내 역경매는 로그인이 필요합니다.')).toBeVisible();

    await page.goto('/payments/success');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('결제는 로그인 후 이용할 수 있습니다.')).toBeVisible();

    await page.goto('/payments/fail');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('결제는 로그인 후 이용할 수 있습니다.')).toBeVisible();
  });

  test('비회원은 결제 API를 호출할 수 없다', async ({ request }) => {
    const prepare = await request.post('/api/payments/prepare', { data: PREPARE_BODY });
    expect(prepare.status()).toBe(401);
    await expect(prepare.json()).resolves.toMatchObject({ errorCode: 'UNAUTHORIZED' });

    const confirm = await request.post('/api/payments/confirm', { data: CONFIRM_BODY });
    expect(confirm.status()).toBe(401);
    await expect(confirm.json()).resolves.toMatchObject({ errorCode: 'UNAUTHORIZED' });

    const cancel = await request.post('/api/payments/cancel', {
      data: { orderId: 'ord_unauthorized_1' },
    });
    expect(cancel.status()).toBe(401);
    await expect(cancel.json()).resolves.toMatchObject({ errorCode: 'UNAUTHORIZED' });
  });

  test('크리에이터는 타인의 관리자 페이지와 결제 API를 사용할 수 없다', async ({
    page,
  }) => {
    await signIn(page, CREATOR);

    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toHaveCount(0);
    await expect(page.getByText('관리자만 접근할 수 있는 페이지입니다.')).toBeVisible();

    const prepare = await page.request.post('/api/payments/prepare', { data: PREPARE_BODY });
    expect(prepare.status()).toBe(403);
    await expect(prepare.json()).resolves.toMatchObject({ errorCode: 'FORBIDDEN' });

    const confirm = await page.request.post('/api/payments/confirm', { data: CONFIRM_BODY });
    expect(confirm.status()).toBe(403);
    await expect(confirm.json()).resolves.toMatchObject({ errorCode: 'FORBIDDEN' });
  });

  test('광고주는 관리자 페이지에 접근할 수 없다', async ({ page }) => {
    await signIn(page, ADVERTISER);
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toHaveCount(0);
    await expect(page.getByText('관리자만 접근할 수 있는 페이지입니다.')).toBeVisible();
  });
});
