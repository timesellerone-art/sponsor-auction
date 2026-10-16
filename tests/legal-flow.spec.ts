import { expect, test } from '@playwright/test';
import { ADVERTISER, signIn } from '../e2e/helpers';

test.describe('전자상거래 약관 및 동의 UI', () => {
  test('푸터에서 이용약관·개인정보·환불 규정 페이지로 이동한다', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByText('스폰서옥션')).toBeVisible();
    await expect(footer.getByRole('link', { name: '서비스 이용약관' })).toBeVisible();
    await expect(footer.getByRole('link', { name: '개인정보 처리방침' })).toBeVisible();
    await expect(footer.getByRole('link', { name: '취소 및 환불 규정' })).toBeVisible();

    await footer.getByRole('link', { name: '서비스 이용약관' }).click();
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByRole('heading', { name: '서비스 이용약관' })).toBeVisible();
    await expect(page.getByText('중개 책임의 한계')).toBeVisible();

    await page.getByRole('contentinfo').getByRole('link', { name: '개인정보 처리방침' }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole('heading', { name: '개인정보 처리방침' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /제3자 제공/ })).toBeVisible();

    await page.getByRole('contentinfo').getByRole('link', { name: '취소 및 환불 규정' }).click();
    await expect(page).toHaveURL(/\/refund/);
    await expect(page.getByRole('heading', { name: '취소 및 환불 / 분쟁 해결 규정' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /100% 환불/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: /크리에이터 제재/ })).toBeVisible();
  });

  test('회원가입은 약관 동의 없이는 진행되지 않는다', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: '회원가입' }).click();
    await page.getByPlaceholder('홍길동').fill('약관 테스트');
    await page.getByPlaceholder('you@example.com').fill('legal-test@example.com');
    await page.getByPlaceholder('6자 이상').fill('demo1234');
    await page.getByRole('button', { name: '가입하고 역할 선택' }).click();
    await expect(
      page.getByRole('alert').filter({
        hasText: '서비스 이용약관 및 개인정보 처리방침에 동의해 주세요.',
      }).first(),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await page
      .getByRole('checkbox', { name: '서비스 이용약관 및 개인정보 처리방침에 동의합니다' })
      .check();
    await expect(
      page.getByRole('checkbox', { name: '서비스 이용약관 및 개인정보 처리방침에 동의합니다' }),
    ).toBeChecked();
  });

  test('결제 모달은 환불 규정 동의 없이 진행할 수 없다', async ({ page }) => {
    await signIn(page, ADVERTISER);
    await page.goto('/');
    await page.getByRole('link', { name: '여름 무알콜 맥주 숏폼 캠페인' }).click();
    await page.getByRole('button', { name: '낙찰하기 (선택)' }).first().click();
    await page.getByRole('button', { name: '결제하고 낙찰하기' }).click();

    const paymentDialog = page.getByRole('dialog', { name: '안전결제' });
    await expect(paymentDialog).toBeVisible();
    await expect(paymentDialog.getByRole('button', { name: '결제하기' })).toBeDisabled();
    await paymentDialog
      .getByRole('checkbox', { name: '구매 조건 확인 및 환불 규정에 동의합니다' })
      .check();
    await expect(paymentDialog.getByRole('button', { name: '결제하기' })).toBeEnabled();
  });
});
