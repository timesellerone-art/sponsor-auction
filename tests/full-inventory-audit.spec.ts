import { expect, test, type Browser, type Page } from '@playwright/test';
import {
  ADMIN,
  ADVERTISER,
  CREATOR,
  signIn,
} from '../e2e/helpers';
import { e2eAdminClient, readE2EEnv } from './helpers/e2e-users';

const CATEGORIES = [
  '콘텐츠 분야 전체',
  '뷰티·패션',
  '푸드·카페',
  '테크·앱',
  '리빙·인테리어',
  '반려동물',
  '헬스·운동',
  '육아·라이프',
] as const;

const PUBLIC_PAGES = [
  { path: '/', heading: /예산과 제품만 올리면|내 채널에 어울리는 캠페인/ },
  { path: '/login', heading: '로그인' },
  { path: '/terms', heading: '서비스 이용약관' },
  { path: '/privacy', heading: '개인정보 처리방침' },
  { path: '/refund', heading: /취소 및 환불/ },
  { path: '/inventory', heading: '타임슬롯 마켓플레이스' },
] as const;

async function expectNoPageError(page: Page, label: string) {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('response', (response) => {
    if (response.status() >= 500 && !response.url().includes('_next/static')) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  await page.waitForLoadState('domcontentloaded');
  expect(errors, `${label} errors:\n${errors.join('\n')}`).toEqual([]);
}

async function expectNoHorizontalOverflow(page: Page, label: string) {
  const report = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(
    report.scrollWidth,
    `${label}: scrollWidth ${report.scrollWidth} > innerWidth ${report.innerWidth}`,
  ).toBeLessThanOrEqual(report.innerWidth);
}

async function assetOk(page: Page, path: string) {
  const response = await page.request.get(path);
  expect(response.ok(), `${path} ${response.status()}`).toBeTruthy();
  const body = await response.body();
  expect(body.byteLength, `${path} empty`).toBeGreaterThan(20);
}

test.describe('전수 검증 0 · 환경·스키마', () => {
  test('필수 env와 auctions.category·campaign-covers 버킷이 살아 있다', async () => {
    const env = readE2EEnv();
    const required = [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'GEMINI_API_KEY',
    ];
    const missing = required.filter((key) => !env[key] || /YOUR_|placeholder|_HERE/i.test(env[key]));
    expect(missing, `missing env: ${missing.join(', ')}`).toEqual([]);

    const admin = e2eAdminClient();
    expect(admin, 'SUPABASE_SERVICE_ROLE_KEY로 관리자 클라이언트를 만들 수 없습니다.').toBeTruthy();
    if (!admin) {
      return;
    }

    const { error: categoryError } = await admin.from('auctions').select('id, category, ai_guide').limit(1);
    expect(categoryError, categoryError?.message).toBeNull();

    const { error: imageError } = await admin.from('auctions').select('id, image_url, thumbnail_url').limit(1);
    if (imageError) {
      expect(imageError.message, imageError.message).toMatch(/image_url|thumbnail_url/);
      const { error: compatError } = await admin
        .from('auctions')
        .select('id, title, platform, budget, description, status, category')
        .limit(1);
      expect(compatError, compatError?.message).toBeNull();
    }

    const { data: buckets, error: bucketError } = await admin.storage.listBuckets();
    expect(bucketError, bucketError?.message).toBeNull();
    expect((buckets ?? []).some((bucket) => bucket.name === 'campaign-covers')).toBeTruthy();
  });
});

test.describe('전수 검증 A · 공통 랜딩·약관·인증', () => {
  test('공개 페이지·로고·테마·역할 탭·반응형이 동작한다', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Clink/);
    await assetOk(page, '/logo.svg');
    await assetOk(page, '/favicon.svg');
    await expect(page.getByRole('tab', { name: '광고주 (브랜드)' }).first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByRole('heading', { name: /예산과 제품만 올리면/ })).toBeVisible();
    await page.getByRole('tab', { name: '크리에이터' }).first().click();
    await expect(page.getByRole('heading', { name: /내 채널에 어울리는 캠페인/ })).toBeVisible();
    await expect(page.getByRole('link', { name: '진행 중인 캠페인 보기' }).first()).toBeVisible();
    await page.getByRole('tab', { name: '광고주 (브랜드)' }).first().click();
    await expect(page.getByRole('button', { name: '캠페인 등록하기' }).first()).toBeVisible();

    const rootBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(rootBg.replace(/\s/g, '')).toMatch(/rgb\(250,\s*248,\s*245\)|rgb\(250,248,245\)/);

    await expect(page.getByRole('link', { name: '서비스 이용약관' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '개인정보 처리방침' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: '취소 및 환불 규정' }).first()).toBeVisible();

    for (const item of PUBLIC_PAGES) {
      const response = await page.goto(item.path);
      expect(response?.status(), item.path).toBeLessThan(400);
      await expect(page.getByRole('heading', { name: item.heading }).first()).toBeVisible();
      await expectNoPageError(page, item.path);
    }

    await page.goto('/this-route-does-not-exist-clink');
    await expect(page.getByRole('heading', { name: '요청하신 주소가 없습니다' })).toBeVisible();

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await expectNoHorizontalOverflow(page, 'mobile-375');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    await expectNoHorizontalOverflow(page, 'tablet-768');
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/');
    await expectNoHorizontalOverflow(page, 'desktop-1280');
  });

  test('8개 공식 카테고리·검색·정렬이 모두 노출된다', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '진행 중인 오픈 캠페인' })).toBeVisible();
    for (const name of CATEGORIES) {
      await expect(page.getByRole('button', { name }).first()).toBeVisible();
    }
    await page.getByRole('button', { name: '육아·라이프' }).click();
    await page.getByRole('button', { name: '콘텐츠 분야 전체' }).click();
    await page.getByRole('searchbox', { name: '캠페인 제목 또는 설명 검색' }).first().fill('무알콜');
    await expect(page.getByRole('link', { name: /여름 무알콜 맥주/ })).toBeVisible();
    await page.getByRole('searchbox', { name: '캠페인 제목 또는 설명 검색' }).first().fill('');
    await expect(page.getByRole('button', { name: '최신순' })).toBeVisible();
    await expect(page.getByRole('button', { name: '높은 예산순' })).toBeVisible();
    await expect(page.getByRole('button', { name: '마감 임박순' })).toBeVisible();
    await page.getByRole('button', { name: '높은 예산순' }).click();
    await expect(page.getByRole('link', { name: /여름 무알콜 맥주/ })).toBeVisible();
  });

  test('Google/Kakao/Naver OAuth URL이 생성된다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
    await expect(page.getByRole('button', { name: '회원가입' })).toBeVisible();
    await page.getByRole('button', { name: '회원가입' }).click();
    await expect(page.getByRole('button', { name: '가입하고 역할 선택' })).toBeVisible();
    await page.getByRole('button', { name: '로그인', exact: true }).click();

    const googleNav = page.waitForURL(
      /accounts\.google\.com|supabase\.co\/auth\/v1\/authorize/,
      { timeout: 15_000 },
    );
    await page.getByRole('button', { name: 'Google로 계속하기' }).click();
    await googleNav;
    expect(page.url()).toMatch(/accounts\.google\.com|provider=google|redirect_to=|redirect_uri=/i);
    await page.goto('/login');

    const kakaoNav = page.waitForURL(/kauth\.kakao\.com|supabase\.co\/auth\/v1\/authorize/, {
      timeout: 15_000,
    });
    await page.getByRole('button', { name: '카카오로 계속하기' }).click();
    await kakaoNav;
    expect(page.url()).toMatch(/kauth\.kakao\.com|provider=kakao|redirect_to=|redirect_uri=/i);
    await page.goto('/login');

    const naverNav = page.waitForURL(/nid\.naver\.com\/oauth2\.0\/authorize|\/api\/auth\/naver/, {
      timeout: 15_000,
    });
    await page.getByRole('button', { name: '네이버로 계속하기' }).click();
    await naverNav;
    expect(page.url()).toMatch(/nid\.naver\.com|client_id=|\/api\/auth\/naver/);
  });
});

test.describe('전수 검증 B · 광고주', () => {
  test('광고주 캠페인 등록 필드·유효성·내 캠페인·설정이 동작한다', async ({ page }) => {
    await signIn(page, ADVERTISER);
    await page.goto('/');
    await expect(page.getByRole('button', { name: '캠페인 등록' }).first()).toBeEnabled();

    const createButton = page.getByRole('navigation', { name: '주요' }).getByRole('button', {
      name: '캠페인 등록',
    });
    const useDesktop = await createButton.isVisible();
    if (useDesktop) {
      await createButton.click();
    } else {
      await page.getByRole('button', { name: '캠페인 등록' }).first().click();
    }
    const dialog = page.getByRole('dialog', { name: '캠페인 등록' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: '캠페인 등록' }).click();
    await expect(dialog.getByText('제목을 입력해 주세요.')).toBeVisible();

    const categoryLabels = await dialog.locator('#auction-category option').allTextContents();
    expect(categoryLabels).toEqual([
      '뷰티·패션',
      '푸드·카페',
      '테크·앱',
      '리빙·인테리어',
      '반려동물',
      '헬스·운동',
      '육아·라이프',
    ]);
    await dialog.locator('#auction-category').selectOption({ label: '육아·라이프' });
    await dialog.getByLabel('제목').fill(`전수검증 육아 캠페인 ${Date.now()}`);
    await dialog.getByLabel('예산').fill('120000');
    await dialog.getByLabel('상세설명').fill('육아템 리뷰 숏폼 1편. 기저귀 교체 루틴을 포함합니다.');
    await expect(dialog.getByLabel('마감일')).toBeVisible();
    await expect(dialog.getByLabel(/대표 사진/)).toBeVisible();
    await dialog.locator('#auction-cover').setInputFiles({
      name: '육아커버.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64',
      ),
    });
    await expect(dialog.getByRole('img', { name: '대표 사진 미리보기' })).toBeVisible();
    await dialog.getByRole('button', { name: '닫기' }).click();

    await page.goto('/my');
    await expect(page.getByRole('heading', { name: '내 캠페인' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '진행 중인 오픈 캠페인' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '결제 완료 목록' })).toBeVisible();
    await expect(page.getByText('토스페이먼츠 승인이 끝난 캠페인')).toBeVisible();
    await expect(page.getByRole('link', { name: '제안 현황 보기' }).first()).toBeVisible();

    await page.goto('/my/settings');
    await expect(page.getByRole('heading', { name: '연동된 계정' })).toBeVisible();
    await expect(page.getByRole('button', { name: '회원 탈퇴' })).toBeVisible();

    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const coverResponse = await page.request.post('/api/campaign-cover', {
      multipart: {
        file: {
          name: '육아커버.png',
          mimeType: 'image/png',
          buffer: png,
        },
      },
    });
    expect(coverResponse.ok(), await coverResponse.text()).toBeTruthy();
    const coverPayload = (await coverResponse.json()) as { url?: string };
    expect(coverPayload.url).toMatch(/campaign-covers/);
    const downloaded = await page.request.get(coverPayload.url!);
    expect(downloaded.ok()).toBeTruthy();
    expect((await downloaded.body()).byteLength).toBeGreaterThan(20);
    const objectPath = decodeURIComponent(
      new URL(coverPayload.url!).pathname.split('/campaign-covers/')[1] ?? '',
    );
    if (objectPath) {
      await e2eAdminClient()?.storage.from('campaign-covers').remove([objectPath]);
    }

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toHaveCount(0);
  });
});

test.describe('전수 검증 C · 크리에이터', () => {
  test('크리에이터 탐색·AI 가이드·AI 제안서·내 제안·인벤토리가 동작한다', async ({ page }) => {
    await signIn(page, CREATOR);
    await page.goto('/');
    await expect(page.getByRole('tab', { name: '크리에이터' }).first()).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.getByRole('link', { name: /여름 무알콜 맥주/ }).click();
    await expect(page).toHaveURL(/\/auctions\//);
    await expect(page.getByRole('heading', { name: 'AI 에이전트 가이드' })).toBeVisible();
    await expect(page.getByText('캠페인 핵심 전략', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: '실시간 채팅' })).toBeVisible();

    await page.getByRole('button', { name: '콘텐츠 제안하기' }).click();
    const bidDialog = page.getByRole('dialog', { name: '콘텐츠 제안하기' });
    await expect(bidDialog).toBeVisible();
    await bidDialog.getByLabel('제안 금액(단가)').fill('110000');
    await bidDialog.getByLabel('내 채널 스타일').fill('20대 직장인 일상 브이로그, 솔직 리뷰');
    await bidDialog.getByRole('button', { name: 'AI로 맞춤 제안서 초안 쓰기' }).click();
    await expect(bidDialog.getByLabel('제안 내용/소개글')).not.toHaveValue('', { timeout: 25_000 });
    await bidDialog.getByRole('button', { name: '닫기' }).click();

    await page.goto('/my');
    await expect(page.getByRole('heading', { name: '내 제안' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '진행 중인 제안' })).toBeVisible();
    await expect(page.getByText('아직 선정되지 않아 광고주 확인을 기다리는 제안입니다.')).toBeVisible();

    await page.goto('/inventory');
    await expect(page.getByRole('heading', { name: '타임슬롯 마켓플레이스' })).toBeVisible();
    const slotLink = page.locator('a[href^="/inventory/"]').first();
    if (await slotLink.count()) {
      await slotLink.click();
      await expect(page).toHaveURL(/\/inventory\//);
      await expect(page.getByRole('heading').first()).toBeVisible();
    }

    await page.getByRole('button', { name: /^알림/ }).first().click();
    await expect(page.getByRole('region', { name: '알림 목록' })).toBeVisible();

    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toHaveCount(0);
  });
});

test.describe('전수 검증 D · 결제 API 차단', () => {
  test('비로그인·크리에이터는 결제/관리자 API가 차단된다', async ({ request, page }) => {
    const prepare = await request.post('/api/payments/prepare', {
      data: { auctionId: 'auc-001', bidId: 'bid-001', amount: 10000, orderName: 'audit' },
    });
    expect(prepare.status()).toBe(401);

    const guestCover = await request.post('/api/campaign-cover');
    expect(guestCover.status()).toBe(401);

    const adminProfiles = await request.get('/api/admin/profiles');
    expect([401, 403, 302]).toContain(adminProfiles.status());

    await signIn(page, CREATOR);
    const creatorPrepare = await page.request.post('/api/payments/prepare', {
      data: {
        auctionId: 'auc-001',
        bidId: 'bid-001',
        amount: 1078000,
        orderName: 'audit',
        customerKey: 'creator',
      },
    });
    expect(creatorPrepare.status()).toBe(403);

    const creatorAdmin = await page.request.get('/api/admin/profiles');
    expect([401, 403]).toContain(creatorAdmin.status());

    const creatorCover = await page.request.post('/api/campaign-cover');
    expect(creatorCover.status()).toBe(403);
  });
});

test.describe('전수 검증 F · 어드민', () => {
  test('관리자 5개 탭과 CSV/XLSX 다운로드가 동작한다', async ({ page }) => {
    await signIn(page, ADMIN);
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: '관리자 대시보드' })).toBeVisible();
    await expect(page.getByText('총 캠페인 수')).toBeVisible();
    await expect(page.getByText(/광고주 \d+ \/ 크리에이터 \d+/)).toBeVisible();

    for (const tab of ['캠페인 관리', '회원 관리', '정산 관리', '제안 관리', '우회 모니터링']) {
      await page.getByRole('button', { name: tab }).click();
      await expect(page.getByRole('button', { name: tab })).toBeVisible();
    }

    await page.getByRole('button', { name: '캠페인 관리' }).click();
    const auctionCsv = page.waitForEvent('download');
    await page.getByRole('button', { name: '엑셀/CSV 다운로드' }).click();
    const auctionFile = await auctionCsv;
    expect(auctionFile.suggestedFilename()).toMatch(/auctions-.*\.csv/);
    const auctionPath = await auctionFile.path();
    expect(auctionPath).toBeTruthy();

    await page.getByRole('button', { name: '회원 관리' }).click();
    const userCsv = page.waitForEvent('download');
    await page.getByRole('button', { name: '엑셀/CSV 다운로드' }).click();
    expect((await userCsv).suggestedFilename()).toMatch(/users-.*\.csv/);

    await page.getByRole('button', { name: '제안 관리' }).click();
    const bidCsv = page.waitForEvent('download');
    await page.getByRole('button', { name: '엑셀/CSV 다운로드' }).click();
    expect((await bidCsv).suggestedFilename()).toMatch(/bids-.*\.csv/);

    await page.getByRole('button', { name: '정산 관리' }).click();
    const payoutXlsx = page.waitForEvent('download');
    await page.getByRole('button', { name: '엑셀/CSV 다운로드' }).click();
    expect((await payoutXlsx).suggestedFilename()).toMatch(/payout-transfer-.*\.xlsx/);

    await page.getByRole('button', { name: '우회 모니터링' }).click();
    await expect(
      page.getByText('감지된 우회 키워드 기록이 없습니다.').or(page.getByRole('columnheader', { name: '시각' })),
    ).toBeVisible();
  });
});

test.describe('전수 검증 · 4세션 동시 스모크', () => {
  test('방문자/광고주/크리에이터/어드민 컨텍스트가 동시에 해당 화면을 연다', async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const guest = await browser.newContext();
    const advertiser = await browser.newContext();
    const creator = await browser.newContext();
    const admin = await browser.newContext();
    const guestPage = await guest.newPage();
    const advertiserPage = await advertiser.newPage();
    const creatorPage = await creator.newPage();
    const adminPage = await admin.newPage();

    try {
      await Promise.all([
        guestPage.goto('/'),
        (async () => {
          await signIn(advertiserPage, ADVERTISER);
          await advertiserPage.goto('/my');
        })(),
        (async () => {
          await signIn(creatorPage, CREATOR);
          await creatorPage.goto('/my');
        })(),
        (async () => {
          await signIn(adminPage, ADMIN);
          await adminPage.goto('/admin');
        })(),
      ]);

      await expect(guestPage.getByRole('tab', { name: '광고주 (브랜드)' }).first()).toBeVisible();
      await expect(advertiserPage.getByRole('heading', { name: '내 캠페인' })).toBeVisible();
      await expect(creatorPage.getByRole('heading', { name: '내 제안' })).toBeVisible();
      await expect(adminPage.getByRole('heading', { name: '관리자 대시보드' })).toBeVisible();
    } finally {
      await Promise.all([guest.close(), advertiser.close(), creator.close(), admin.close()]);
    }
  });
});
