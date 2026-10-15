import { expect, test } from '@playwright/test';
import { ADVERTISER, CREATOR, acceptAgreements, signIn, signOut } from '../e2e/helpers';

const CLOSED_AUCTION = '러닝화 언박싱 틱톡 챌린지';
const AWARDED_AUCTION = '핀테크 앱 X 스레드 체험단';
const OPEN_AUCTION = '여름 무알콜 맥주 숏폼 캠페인';
const DUPLICATE_AUCTION = '비건 스킨케어 릴스 리뷰';
const VALID_PROPOSAL =
  '채널 톤에 맞춰 3초 훅과 제품 클로즈업을 넣은 숏폼 1편을 제작하겠습니다.';
const VALID_CHANNEL = 'https://www.youtube.com/@e2ecreator';

async function openCreateAuction(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page
    .getByRole('navigation', { name: '주요' })
    .getByRole('button', { name: '역경매 등록' })
    .click();
  const dialog = page.getByRole('dialog', { name: '역경매 요청하기' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function openBidModal(page: import('@playwright/test').Page, title: string) {
  await page.goto('/');
  await page.getByRole('link', { name: title }).click();
  await expect(page).toHaveURL(/\/auctions\//);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await page.getByRole('button', { name: '제안하기' }).click();
  const dialog = page.getByRole('dialog', { name: '제안하기' });
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('입력 유효성 및 예외 시나리오', () => {
  test('필수 입력값을 비우고 제출하면 폼이 차단되고 안내가 표시된다', async ({
    page,
  }) => {
    await signIn(page, ADVERTISER);
    const createDialog = await openCreateAuction(page);
    await createDialog.getByRole('button', { name: '역경매 등록' }).click();
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByText('제목을 입력해 주세요.')).toBeVisible();
    await expect(createDialog.getByText('예산을 입력해 주세요.')).toBeVisible();
    await expect(createDialog.getByText('상세설명을 입력해 주세요.')).toBeVisible();

    await createDialog.getByRole('button', { name: '닫기' }).click();
    await signOut(page);

    await signIn(page, CREATOR);
    const bidDialog = await openBidModal(page, OPEN_AUCTION);
    await bidDialog.getByRole('button', { name: '제안 제출' }).click();
    await expect(bidDialog).toBeVisible();
    await expect(bidDialog.getByText('제안 금액을 입력해 주세요.')).toBeVisible();
    await expect(bidDialog.getByText('제안 내용/소개글을 입력해 주세요.')).toBeVisible();
    await expect(
      bidDialog.getByText('채널 URL 또는 포트폴리오 링크를 입력해 주세요.'),
    ).toBeVisible();
    await expect(bidDialog.getByText('서비스 이용약관에 동의해 주세요.')).toBeVisible();
    await expect(bidDialog.getByText('개인정보처리방침에 동의해 주세요.')).toBeVisible();
  });

  test('0원 이하, 음수, 허용 범위 초과 금액은 등록되지 않는다', async ({ page }) => {
    await signIn(page, ADVERTISER);
    const createDialog = await openCreateAuction(page);
    await createDialog.getByLabel('제목').fill('E2E 금액 검증 캠페인');
    await createDialog
      .getByLabel('상세설명')
      .fill('금액 유효성 검사를 위한 상세설명입니다.');

    await createDialog.getByLabel('예산').fill('0');
    await createDialog.getByRole('button', { name: '역경매 등록' }).click();
    await expect(createDialog.getByText('예산은 0원 이하일 수 없습니다.')).toBeVisible();

    await createDialog.getByLabel('예산').fill('-5000');
    await createDialog.getByRole('button', { name: '역경매 등록' }).click();
    await expect(createDialog.getByText('예산은 0원 이하일 수 없습니다.')).toBeVisible();

    await createDialog.getByLabel('예산').fill('200000000');
    await createDialog.getByRole('button', { name: '역경매 등록' }).click();
    await expect(createDialog.getByText('예산은 1억 원을 초과할 수 없습니다.')).toBeVisible();
    await expect(createDialog).toBeVisible();
    await createDialog.getByRole('button', { name: '닫기' }).click();

    await signOut(page);
    await signIn(page, CREATOR);
    const bidDialog = await openBidModal(page, OPEN_AUCTION);
    await bidDialog.getByLabel('제안 내용/소개글').fill(VALID_PROPOSAL);
    await bidDialog.getByLabel('채널 URL 또는 포트폴리오 링크').fill(VALID_CHANNEL);
    await acceptAgreements(bidDialog);

    await bidDialog.getByLabel('제안 금액(단가)').fill('0');
    await bidDialog.getByRole('button', { name: '제안 제출' }).click();
    await expect(bidDialog.getByText('제안 금액은 0원 이하일 수 없습니다.')).toBeVisible();

    await bidDialog.getByLabel('제안 금액(단가)').fill('-12000');
    await bidDialog.getByRole('button', { name: '제안 제출' }).click();
    await expect(bidDialog.getByText('제안 금액은 0원 이하일 수 없습니다.')).toBeVisible();

    await bidDialog.getByLabel('제안 금액(단가)').fill('200000000');
    await bidDialog.getByRole('button', { name: '제안 제출' }).click();
    await expect(bidDialog.getByText('제안 금액은 1억 원을 초과할 수 없습니다.')).toBeVisible();
    await expect(bidDialog).toBeVisible();
  });

  test('마감·낙찰 완료된 역경매에는 제안을 제출할 수 없다', async ({ page }) => {
    await signIn(page, CREATOR);

    await page.goto('/');
    await page.getByRole('link', { name: CLOSED_AUCTION }).click();
    await expect(page).toHaveURL(/\/auctions\//);
    await expect(page.getByRole('button', { name: '제안하기' })).toHaveCount(0);
    await expect(page.getByText('매칭 완료된 역경매입니다').first()).toBeVisible();
    await expect(
      page.getByText('이 역경매는 마감되었거나 제안을 받지 않습니다.'),
    ).toBeVisible();

    await page.goto('/');
    await page.getByRole('link', { name: AWARDED_AUCTION }).click();
    await expect(page).toHaveURL(/\/auctions\//);
    await expect(page.getByRole('button', { name: '제안하기' })).toHaveCount(0);
    await expect(page.getByText('결제 완료된 역경매입니다').first()).toBeVisible();
    await expect(page.getByRole('dialog', { name: '제안하기' })).toHaveCount(0);
  });

  test('같은 역경매에 중복 제안을 제출하면 차단된다', async ({ page }) => {
    await signIn(page, CREATOR);
    const first = await openBidModal(page, DUPLICATE_AUCTION);
    await first.getByLabel('제안 금액(단가)').fill('320000');
    await first.getByLabel('제안 내용/소개글').fill(VALID_PROPOSAL);
    await first.getByLabel('채널 URL 또는 포트폴리오 링크').fill(VALID_CHANNEL);
    await acceptAgreements(first);
    await first.getByRole('button', { name: '제안 제출' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /^제안을 제출했습니다\.?$/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: '제안하기' })).toHaveCount(0, {
      timeout: 20_000,
    });

    const second = await openBidModal(page, DUPLICATE_AUCTION);
    await second.getByLabel('제안 금액(단가)').fill('330000');
    await second.getByLabel('제안 내용/소개글').fill(VALID_PROPOSAL);
    await second.getByLabel('채널 URL 또는 포트폴리오 링크').fill(VALID_CHANNEL);
    await acceptAgreements(second);
    await second.getByRole('button', { name: '제안 제출' }).click();
    await expect(second).toBeVisible();
    await expect(
      second.getByRole('alert').filter({ hasText: '이미 이 역경매에 제안을 제출했습니다.' }),
    ).toBeVisible();
  });
});
