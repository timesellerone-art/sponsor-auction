import { expect, test } from '@playwright/test';
import {
  ADVERTISER,
  CREATOR,
  signIn,
  signOut,
  uniqueCampaignTitle,
  acceptAgreements,
} from './helpers';

test('광고주 등록 → 크리에이터 제안 → 광고주 낙찰까지 매칭이 완료된다', async ({
  page,
}) => {
  const title = uniqueCampaignTitle();
  const description =
    'E2E 자동 검증용 캠페인입니다. 숏폼 1편과 필수 컷을 포함해 주세요.';
  const proposal =
    '채널 톤에 맞춰 3초 훅과 제품 클로즈업을 넣은 숏폼 1편을 제작하겠습니다.';

  await test.step('광고주가 역경매를 등록한다', async () => {
    await signIn(page, ADVERTISER);
    await page.goto('/');
    await page
      .getByRole('navigation', { name: '주요' })
      .getByRole('button', { name: '역경매 등록' })
      .click();

    const createDialog = page.getByRole('dialog', { name: '역경매 요청하기' });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel('제목').fill(title);
    await createDialog.getByLabel('플랫폼').selectOption('youtube_shorts');
    await createDialog.getByLabel('예산').fill('150000');
    await createDialog.getByLabel('상세설명').fill(description);
    await createDialog.getByRole('button', { name: '역경매 등록' }).click();
    await expect(createDialog).toBeHidden();
    await expect(page.getByRole('link', { name: title })).toBeVisible();
  });

  await test.step('크리에이터가 제안에 입찰한다', async () => {
    await signOut(page);
    await signIn(page, CREATOR);
    await page.goto('/');
    await page.getByRole('link', { name: title }).click();
    await expect(page).toHaveURL(/\/auctions\//);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await page.getByRole('button', { name: '제안하기' }).click();

    const bidDialog = page.getByRole('dialog', { name: '제안하기' });
    await expect(bidDialog).toBeVisible();
    await bidDialog.getByLabel('제안 금액(단가)').fill('120000');
    await bidDialog.getByLabel('제안 내용/소개글').fill(proposal);
    await bidDialog
      .getByLabel('채널 URL 또는 포트폴리오 링크')
      .fill('https://www.youtube.com/@e2ecreator');
    await acceptAgreements(bidDialog);
    await bidDialog.getByRole('button', { name: '제안 제출' }).click();

    await expect(bidDialog).toBeHidden();
    await expect(
      page.getByRole('alert').filter({ hasText: '제안을 제출했습니다.' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '제출된 크리에이터 제안 목록' })).toBeVisible();
    await expect(page.getByText(proposal)).toBeVisible();
  });

  await test.step('광고주가 제안을 낙찰하고 매칭을 완료한다', async () => {
    await signOut(page);
    await signIn(page, ADVERTISER);
    await page.goto('/');
    await page.getByRole('link', { name: title }).click();
    await expect(page).toHaveURL(/\/auctions\//);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '제출된 크리에이터 제안 목록' }),
    ).toBeVisible();
    await expect(page.getByText(proposal)).toBeVisible();

    await page.getByRole('button', { name: '낙찰하기 (선택)' }).click();
    const confirmDialog = page.getByRole('dialog', {
      name: '이 제안을 낙찰할까요?',
    });
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole('button', { name: '결제하고 낙찰하기' }).click();

    const paymentDialog = page.getByRole('dialog', { name: '안전결제' });
    await expect(paymentDialog).toBeVisible();
    await paymentDialog.getByRole('button', { name: '결제하기' }).click();
    await expect(page).toHaveURL(/\/(payments\/success|auctions\/)/);
    await expect(page).toHaveURL(/\/auctions\//, { timeout: 20_000 });

    await expect(
      page.getByRole('alert').filter({
        hasText: '낙찰이 확정되었고 역경매가 마감되었습니다.',
      }),
    ).toBeVisible();
    await expect(page.getByText('매칭 완료된 역경매입니다').first()).toBeVisible();
    await expect(page.getByText('선택된 크리에이터').first()).toBeVisible();
    await expect(page.getByText('낙찰됨')).toBeVisible();
    await expect(
      page.getByRole('button', { name: '낙찰하기 (선택)' }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: '제안하기' })).toHaveCount(0);
  });
});
