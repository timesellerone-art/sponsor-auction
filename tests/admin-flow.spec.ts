import { expect, test } from '@playwright/test';
import {
  ADMIN,
  ADVERTISER,
  CREATOR,
  acceptNextConfirm,
  signIn,
  unlockAdmin,
} from '../e2e/helpers';

const ACTIVE_AUCTION = '여름 무알콜 맥주 숏폼 캠페인';
const CLOSED_AUCTION = '핀테크 앱 X 스레드 체험단';
const BLINDED_AUCTION = '로컬 카페 브이로그 스폰서십';
const SEARCH_AUTHOR = '한강브루어리';
const MEMBER_NAME = '아워피부랩';

test.describe('관리자 페이지 핵심 기능', () => {
  test('비회원과 일반 회원은 /admin 직접 접근이 차단된다', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
    await expect(
      page.getByText('관리자 페이지는 로그인이 필요합니다.'),
    ).toBeVisible();

    await signIn(page, ADVERTISER);
    await page.goto('/admin');
    await expect(page).not.toHaveURL(/\/admin/);
    await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toHaveCount(0);
    await expect(page.getByText('관리자만 접근할 수 있는 페이지입니다.')).toBeVisible();
  });

  test('크리에이터는 마이페이지에서 내 제안을 본다', async ({ page }) => {
    await signIn(page, CREATOR);
    await page.goto('/my');
    await expect(page).toHaveURL(/\/my/);
    await expect(page.getByRole('heading', { name: '내 제안' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '낙찰/결제 완료' })).toBeVisible();
  });

  test('관리자 로그인 후 대시보드와 통계 요약이 노출된다', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByRole('navigation', { name: '주요' }).getByRole('link', { name: '관리자' })).toBeVisible();

    await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toBeVisible();
    await expect(page.getByText('총 역경매 수')).toBeVisible();
    await expect(page.getByText('진행 중인 역경매 수')).toBeVisible();
    await expect(page.getByText('전체 가입 회원 수')).toBeVisible();
    await expect(page.getByText('블라인드 처리된 게시글 수')).toBeVisible();
    await expect(page.getByText(/광고주 \d+ \/ 크리에이터 \d+/)).toBeVisible();
  });

  test('전체 역경매 목록, 검색, 상태 필터가 동작한다', async ({ page }) => {
    await unlockAdmin(page);

    await page.getByRole('button', { name: '역경매 관리' }).click();
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: '제목' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '작성자' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '상태' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '관리' })).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_AUCTION })).toBeVisible();
    await expect(page.getByRole('link', { name: CLOSED_AUCTION })).toBeVisible();
    await expect(page.getByRole('link', { name: BLINDED_AUCTION })).toBeVisible();

    await page.getByPlaceholder('제목 또는 작성자 검색').fill(SEARCH_AUTHOR);
    await expect(page.getByRole('link', { name: ACTIVE_AUCTION })).toBeVisible();
    await expect(page.getByRole('link', { name: CLOSED_AUCTION })).toHaveCount(0);

    await page.getByPlaceholder('제목 또는 작성자 검색').fill('');
    await page.getByRole('button', { name: '진행중', exact: true }).click();
    await expect(page.getByRole('link', { name: ACTIVE_AUCTION })).toBeVisible();
    await expect(page.getByRole('link', { name: CLOSED_AUCTION })).toHaveCount(0);

    await page.getByRole('button', { name: '마감', exact: true }).click();
    await expect(page.getByRole('link', { name: CLOSED_AUCTION })).toBeVisible();
    await expect(page.getByRole('link', { name: ACTIVE_AUCTION })).toHaveCount(0);

    await page.getByRole('button', { name: '블라인드', exact: true }).click();
    await expect(page.getByRole('link', { name: BLINDED_AUCTION })).toBeVisible();
    await expect(
      page.getByRole('row', { name: new RegExp(BLINDED_AUCTION) }).getByText('블라인드', { exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: '전체', exact: true }).click();
    await expect(page.getByRole('link', { name: ACTIVE_AUCTION })).toBeVisible();
    await expect(page.getByRole('link', { name: CLOSED_AUCTION })).toBeVisible();
  });

  test('부적절한 역경매를 숨김(블라인드) 처리하고 해제하면 UI와 토스트가 갱신된다', async ({
    page,
  }) => {
    await unlockAdmin(page);
    await page.getByRole('button', { name: '역경매 관리' }).click();

    const targetRow = page.getByRole('row', { name: new RegExp(ACTIVE_AUCTION) });
    await expect(targetRow.getByText('진행중', { exact: true })).toBeVisible();

    await acceptNextConfirm(page);
    await targetRow.getByRole('button', { name: '블라인드 처리' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: '블라인드 처리했습니다.' }),
    ).toBeVisible();
    await expect(targetRow.getByText('블라인드', { exact: true })).toBeVisible();
    await expect(targetRow.getByRole('button', { name: '블라인드 해제' })).toBeVisible();

    await page.getByRole('button', { name: '블라인드', exact: true }).click();
    await expect(page.getByRole('link', { name: ACTIVE_AUCTION })).toBeVisible();

    await acceptNextConfirm(page);
    await targetRow.getByRole('button', { name: '블라인드 해제' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: '블라인드를 해제했습니다.' }),
    ).toBeVisible();

    await page.getByRole('button', { name: '전체', exact: true }).click();
    await expect(targetRow.getByText('진행중', { exact: true })).toBeVisible();
    await expect(targetRow.getByRole('button', { name: '블라인드 처리' })).toBeVisible();
  });

  test('회원 목록에서 광고주/크리에이터 권한과 정지 상태를 관리한다', async ({
    page,
  }) => {
    await unlockAdmin(page);

    await page.getByRole('button', { name: '회원 관리' }).click();
    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: '이름/이메일' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '역할' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '상태' })).toBeVisible();

    await expect(page.getByText('한강브루어리')).toBeVisible();
    await expect(page.getByText('민지쇼츠')).toBeVisible();
    await expect(page.getByText('광고주').first()).toBeVisible();
    await expect(page.getByText('크리에이터').first()).toBeVisible();

    const memberRow = page.getByRole('row', { name: new RegExp(MEMBER_NAME) });
    await expect(memberRow.getByText('광고주')).toBeVisible();
    await expect(memberRow.getByText('정상')).toBeVisible();

    await acceptNextConfirm(page);
    await memberRow.getByRole('button', { name: '정지', exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: '회원을 정지했습니다.' }),
    ).toBeVisible();
    await expect(memberRow.getByText('정지', { exact: true })).toBeVisible();
    await expect(memberRow.getByRole('button', { name: '정지 해제' })).toBeVisible();

    await acceptNextConfirm(page);
    await memberRow.getByRole('button', { name: '정지 해제' }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: '정지를 해제했습니다.' }),
    ).toBeVisible();
    await expect(memberRow.getByText('정상')).toBeVisible();

    await page.getByRole('button', { name: '입찰 관리' }).click();
    await expect(page.getByText('민지쇼츠').first()).toBeVisible();
    await expect(page.getByText(ACTIVE_AUCTION).first()).toBeVisible();
  });

  test('정산 관리에 시드 정산과 결제 완료 캠페인이 함께 표시된다', async ({ page }) => {
    await unlockAdmin(page);
    await page.getByRole('button', { name: '정산 관리' }).click();

    const table = page.getByRole('table');
    await expect(table.getByRole('columnheader', { name: '크리에이터' })).toBeVisible();
    await expect(table.getByRole('columnheader', { name: '정산 금액' })).toBeVisible();
    await expect(page.getByText('민지쇼츠').first()).toBeVisible();
    await expect(page.getByText(CLOSED_AUCTION).first()).toBeVisible();
    await expect(page.getByText('지급 대기').first()).toBeVisible();
    await expect(page.getByText('지급 완료').first()).toBeVisible();
    await expect(page.getByRole('button', { name: '지급 처리' }).first()).toBeVisible();
  });
});
