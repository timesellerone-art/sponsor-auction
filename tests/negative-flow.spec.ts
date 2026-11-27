import { expect, test } from '@playwright/test';
import {
  ADVERTISER,
  CREATOR,
  VALID_CHANNEL_URL,
  acceptAgreements,
  openCreateAuction,
  signIn,
  signOut,
} from '../e2e/helpers';

const CLOSED_AUCTION = '러닝화 언박싱 틱톡 챌린지';
const AWARDED_AUCTION = '핀테크 앱 X 스레드 체험단';
const OPEN_AUCTION = '여름 무알콜 맥주 숏폼 캠페인';
const DUPLICATE_AUCTION = '비건 스킨케어 릴스 리뷰';
const VALID_PROPOSAL =
  '채널 톤에 맞춰 3초 훅과 제품 클로즈업을 넣은 숏폼 1편을 제작하겠습니다.';
const VALID_CHANNEL = VALID_CHANNEL_URL;
const BYPASS_BLOCK_MESSAGE =
  '안전한 거래를 위해 연락처(전화번호, 계좌번호, 카카오톡 등) 및 직거래 유도 표현은 입력할 수 없습니다.';

async function openBidModal(page: import('@playwright/test').Page, title: string) {
  await page.goto('/');
  await page.getByRole('link', { name: title }).click();
  await expect(page).toHaveURL(/\/auctions\//);
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  const bidButton = page.getByRole('button', { name: '캠페인 지원' });
  await expect(bidButton).toBeEnabled({ timeout: 15_000 });
  await bidButton.click();
  const dialog = page.getByRole('dialog', { name: '캠페인 지원' });
  await expect(dialog).toBeVisible({ timeout: 12_000 });
  return dialog;
}

test.describe('입력 유효성 및 예외 시나리오', () => {
  test('필수 입력값을 비우고 제출하면 폼이 차단되고 안내가 표시된다', async ({
    page,
  }) => {
    await signIn(page, ADVERTISER);
    const createDialog = await openCreateAuction(page);
    await createDialog.getByRole('button', { name: '캠페인 등록' }).click();
    await expect(createDialog).toBeVisible();
    await expect(createDialog.getByText('제목을 입력해 주세요.')).toBeVisible();
    await expect(createDialog.getByText('확정 지급액을 입력해 주세요.')).toBeVisible();
    await expect(createDialog.getByText('상세설명을 입력해 주세요.')).toBeVisible();

    await createDialog.getByRole('button', { name: '닫기' }).click();
    await signOut(page);

    await signIn(page, CREATOR);
    const bidDialog = await openBidModal(page, OPEN_AUCTION);
    await bidDialog.getByRole('button', { name: '캠페인 지원 제출' }).click();
    await expect(bidDialog).toBeVisible();
    await expect(bidDialog.getByText('제작 콘셉트·방향을 입력해 주세요.')).toBeVisible();
    await expect(
      bidDialog.getByText('채널 URL 또는 포트폴리오 링크를 입력해 주세요.'),
    ).toBeVisible();
    await expect(bidDialog.getByText('서비스 이용약관에 동의해 주세요.')).toBeVisible();
    await expect(bidDialog.getByText('개인정보처리방침에 동의해 주세요.')).toBeVisible();
  });

  test('제안서에 전화번호·카톡을 입력하면 직거래 우회가 차단된다', async ({ page }) => {
    await signIn(page, CREATOR);
    const dialog = await openBidModal(page, OPEN_AUCTION);
    await dialog
      .getByLabel('제작 콘셉트·방향')
      .fill('촬영 일정은 010-1234-5678로 연락 주시면 바로 조율하겠습니다.');
    await dialog.getByLabel('채널 URL 또는 포트폴리오 링크').fill(VALID_CHANNEL);
    await acceptAgreements(dialog);
    await dialog.getByRole('button', { name: '캠페인 지원 제출' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(BYPASS_BLOCK_MESSAGE).first()).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: BYPASS_BLOCK_MESSAGE }).first()).toBeVisible();

    await dialog
      .getByLabel('제작 콘셉트·방향')
      .fill('카톡으로 따로 연락 주시면 직거래로 진행하겠습니다. 촬영은 가능합니다.');
    await dialog.getByRole('button', { name: '캠페인 지원 제출' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(BYPASS_BLOCK_MESSAGE).first()).toBeVisible();
  });

  test('0원 이하, 음수, 허용 범위 초과 금액은 등록되지 않는다', async ({ page }) => {
    await signIn(page, ADVERTISER);
    const createDialog = await openCreateAuction(page);
    await createDialog.getByLabel('제목').fill('E2E 금액 검증 캠페인');
    await createDialog
      .getByLabel('상세설명')
      .fill('금액 유효성 검사를 위한 상세설명입니다.');

    await createDialog.getByLabel('확정 지급액 (캠페인 모집 단가)').fill('0');
    await createDialog.getByRole('button', { name: '캠페인 등록' }).click();
    await expect(createDialog.getByText('확정 지급액은 0원 이하일 수 없습니다.')).toBeVisible();

    await createDialog.getByLabel('확정 지급액 (캠페인 모집 단가)').fill('-5000');
    await createDialog.getByRole('button', { name: '캠페인 등록' }).click();
    await expect(createDialog.getByText('확정 지급액은 0원 이하일 수 없습니다.')).toBeVisible();

    await createDialog.locator('#auction-budget').fill('200000000');
    await createDialog.getByRole('button', { name: '캠페인 등록' }).click();
    await expect(createDialog.getByRole('alert').filter({ hasText: '1억' })).toBeVisible();
    await expect(createDialog).toBeVisible();
    await createDialog.getByRole('button', { name: '닫기' }).click();

    await signOut(page);
    await signIn(page, CREATOR);
    const bidDialog = await openBidModal(page, OPEN_AUCTION);
    await expect(bidDialog.getByText('확정 지급액 (캠페인 모집 단가)')).toBeVisible();
    await expect(bidDialog.getByLabel('제안 금액(단가)')).toHaveCount(0);
    await bidDialog.getByRole('button', { name: '닫기' }).click();
  });

  test('마감·선정 완료된 캠페인에는 지원할 수 없다', async ({ page }) => {
    await signIn(page, CREATOR);

    await page.goto('/');
    await page.getByRole('link', { name: CLOSED_AUCTION }).click();
    await expect(page).toHaveURL(/\/auctions\//);
    await expect(page.getByRole('button', { name: '캠페인 지원' })).toHaveCount(0);
    await expect(page.getByText('선정된 캠페인입니다').first()).toBeVisible();
    await expect(
      page.getByText('이 캠페인은 모집이 마감되었거나 지원을 받지 않습니다.'),
    ).toBeVisible();

    await page.goto('/');
    await page.getByRole('link', { name: AWARDED_AUCTION }).click();
    await expect(page).toHaveURL(/\/auctions\//);
    await expect(page.getByRole('button', { name: '캠페인 지원' })).toHaveCount(0);
    await expect(page.getByText('결제 완료된 캠페인입니다').first()).toBeVisible();
    await expect(page.getByRole('dialog', { name: '캠페인 지원' })).toHaveCount(0);
  });

  test('같은 캠페인에 중복 지원하면 차단된다', async ({ page }) => {
    await signIn(page, CREATOR);
    const first = await openBidModal(page, DUPLICATE_AUCTION);
    await first.getByLabel('제작 콘셉트·방향').fill(VALID_PROPOSAL);
    await first.getByLabel('채널 URL 또는 포트폴리오 링크').fill(VALID_CHANNEL);
    await acceptAgreements(first);
    await first.getByRole('button', { name: '캠페인 지원 제출' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: /캠페인 지원을 제출했습니다/ }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('dialog', { name: '캠페인 지원' })).toHaveCount(0, {
      timeout: 20_000,
    });

    const second = await openBidModal(page, DUPLICATE_AUCTION);
    await second.getByLabel('제작 콘셉트·방향').fill(VALID_PROPOSAL);
    await second.getByLabel('채널 URL 또는 포트폴리오 링크').fill(VALID_CHANNEL);
    await acceptAgreements(second);
    await second.getByRole('button', { name: '캠페인 지원 제출' }).click();
    await expect(second).toBeVisible();
    await expect(
      second.getByRole('alert').filter({ hasText: '이미 이 캠페인에 지원했습니다.' }),
    ).toBeVisible();
  });
});
