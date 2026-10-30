import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type BrowserContext } from '@playwright/test';

const AUTH_REQUIRED_TOAST = '이 기능을 사용하려면 로그인이 필요합니다.';
const SESSION_FAIL_COPY = '로그인 정보를 확인하지 못했습니다';
const VISIBLE_SPINNER = 'main .animate-spin:visible';

function readEnv() {
  const values: Record<string, string> = { ...process.env } as Record<string, string>;
  try {
    const raw = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const index = line.indexOf('=');
      if (index <= 0 || line.trim().startsWith('#')) {
        continue;
      }
      const key = line.slice(0, index).trim();
      values[key] ??= line.slice(index + 1).trim().replace(/^"|"$/g, '');
    }
  } catch {
    // .env.local이 없으면 process.env만 사용한다.
  }
  return values;
}

function adminClient(): SupabaseClient | null {
  const env = readEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sessionUserId(context: BrowserContext): Promise<string | null> {
  const chunks = (await context.cookies('http://localhost:3000'))
    .filter((cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name))
    .sort((left, right) => left.name.localeCompare(right.name, 'en', { numeric: true }));
  const raw = chunks.map((cookie) => cookie.value).join('');
  if (!raw) {
    return null;
  }
  const json = raw.startsWith('base64-')
    ? Buffer.from(raw.slice('base64-'.length), 'base64url').toString('utf8')
    : decodeURIComponent(raw);
  const session = JSON.parse(json) as { user?: { id?: string } };
  return session.user?.id ?? null;
}

test.describe('실전 소셜 로그인 / 콜백 / 온보딩', () => {
  test('a) 로그인 페이지에 구글·카카오·네이버 버튼이 있다', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '카카오로 계속하기' })).toBeVisible();
    await expect(page.getByRole('button', { name: '네이버로 계속하기' })).toBeVisible();
  });

  test('a) Google 로그인은 쿼리 없는 redirect_to와 PKCE verifier 쿠키로 실제 인가 서버에 간다', async ({
    page,
    context,
  }) => {
    await page.goto('/login');
    const authorize = page.waitForRequest(/\/auth\/v1\/authorize\?/);
    await page.getByRole('button', { name: 'Google로 계속하기' }).click();
    const authorizeUrl = new URL((await authorize).url());
    expect(authorizeUrl.searchParams.get('provider')).toBe('google');
    expect(authorizeUrl.searchParams.get('code_challenge')).toBeTruthy();
    expect(authorizeUrl.searchParams.get('redirect_to')).toBe('http://localhost:3000/auth/callback');

    const cookies = await context.cookies('http://localhost:3000');
    const verifier = cookies.find((cookie) => cookie.name.endsWith('-auth-token-code-verifier'));
    expect(verifier, 'PKCE code verifier 쿠키가 있어야 콜백에서 교환할 수 있다').toBeTruthy();
    expect(verifier?.path).toBe('/');
    expect(cookies.find((cookie) => cookie.name === 'sponsor-auction-oauth-next')?.value).toBe(
      encodeURIComponent('/onboarding/role-select'),
    );
    await page.waitForURL(/accounts\.google\.com/, { timeout: 20000 });
  });

  test('a) 네이버 로그인은 자체 콜백으로 실제 네이버 인가 창에 간다', async ({ page, context }) => {
    await page.goto('/login');
    const authorize = page.waitForRequest(/nid\.naver\.com\/oauth2\.0\/authorize/);
    await page.getByRole('button', { name: '네이버로 계속하기' }).click();
    const authorizeUrl = new URL((await authorize).url());
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('client_id')).toBeTruthy();
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/api/auth/naver/callback',
    );
    expect(authorizeUrl.searchParams.get('auth_type')).toBeNull();

    const cookies = await context.cookies('http://localhost:3000');
    expect(cookies.find((cookie) => cookie.name === 'sa_naver_oauth_state')?.httpOnly).toBe(true);
    expect(
      decodeURIComponent(cookies.find((cookie) => cookie.name === 'sa_naver_oauth_next')?.value ?? ''),
    ).toBe('/onboarding/role-select');
    await page.waitForURL(/nid\.naver\.com/, { timeout: 20000 });
  });

  test('b) 콜백 교환 실패 시 상세 사유와 함께 /login?error=oauth_failed 로 보낸다', async ({
    page,
    request,
  }) => {
    const response = await request.fetch('/auth/callback?code=invalid-oauth-code', {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(response.status()).toBeLessThan(400);
    const location = new URL(response.headers().location ?? '', 'http://localhost:3000');
    expect(location.pathname).toBe('/login');
    expect(location.searchParams.get('error')).toBe('oauth_failed');
    expect(location.searchParams.get('error_description')).toBeTruthy();

    const sessionCookies = response
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value)
      .filter((value) => /-auth-token=/.test(value) && !/Max-Age=0/i.test(value));
    expect(sessionCookies, '실패한 교환은 세션 쿠키를 발급하지 않는다').toHaveLength(0);

    await page.goto(location.pathname + location.search);
    await expect(page.getByText(location.searchParams.get('error_description') ?? '')).toBeVisible();
  });

  test('b) 공급자 오류(Database error saving new user)는 원인과 함께 로그인으로 보낸다', async ({
    request,
  }) => {
    const response = await request.fetch(
      '/auth/callback?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user',
      { maxRedirects: 0, failOnStatusCode: false },
    );
    const location = new URL(response.headers().location ?? '', 'http://localhost:3000');
    expect(location.searchParams.get('error')).toBe('oauth_failed');
    expect(location.searchParams.get('error_description')).toContain('데이터베이스 오류');
  });

  test('b) 카카오 콜백 중복으로 Supabase가 bad_oauth_state를 보내면 같은 공급자로 한 번만 재시도한다', async ({
    page,
  }) => {
    // Supabase가 Site URL로 보내는 실제 오류 리다이렉트 형식 그대로다.
    const stateLost =
      '/?error=invalid_request&error_code=bad_oauth_state&error_description=OAuth+state+not+found+or+expired';
    const kakaoAuthorize = (url: string) =>
      /\/auth\/v1\/authorize\?/.test(url) && new URL(url).searchParams.get('provider') === 'kakao';

    await page.goto('/login');
    const firstAuthorize = page.waitForRequest((request) => kakaoAuthorize(request.url()));
    await page.getByRole('button', { name: '카카오로 계속하기' }).click();
    await firstAuthorize;
    await page.waitForURL(/kakao\.com/, { timeout: 20000 });

    const retried = page.waitForRequest((request) => kakaoAuthorize(request.url()), { timeout: 20000 });
    await page.goto(stateLost);
    const retriedUrl = new URL((await retried).url());
    expect(retriedUrl.searchParams.get('redirect_to')).toBe('http://localhost:3000/auth/callback');
    await page.waitForURL(/kakao\.com/, { timeout: 20000 });

    let loopedAuthorize = false;
    page.on('request', (request) => {
      if (kakaoAuthorize(request.url())) {
        loopedAuthorize = true;
      }
    });
    await page.goto(stateLost);
    await expect(page).toHaveURL(/\/login\?error=oauth_retry/);
    await expect(page.getByText('소셜 로그인 확인이 중복 처리되었습니다')).toBeVisible({
      timeout: 10000,
    });
    await page.waitForTimeout(1500);
    expect(loopedAuthorize, '두 번째 state 소실에서는 자동 재시도로 루프를 돌지 않는다').toBe(false);
  });

  test('c) 실제 Supabase 신규 유저 세션으로 온보딩에 진입하면 실패 화면/무한 스피너가 없다', async ({
    page,
    context,
  }) => {
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 실유저 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const email = `e2e.onboarding.${Date.now()}@sponsor-auction.test`;
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { name: 'E2E 온보딩' },
    });
    expect(created.error, created.error?.message).toBeNull();
    const userId = created.data.user?.id ?? '';

    try {
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      expect(link.error, link.error?.message).toBeNull();
      const tokenHash = link.data.properties?.hashed_token ?? '';
      expect(tokenHash).toBeTruthy();

      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/onboarding')}`,
      );
      await expect(page).toHaveURL(/\/onboarding\/role-select/, { timeout: 15000 });
      await expect(page.getByRole('heading', { name: /역할을 선택해 주세요/ })).toBeVisible({
        timeout: 8000,
      });
      await expect(page.getByText(SESSION_FAIL_COPY)).toHaveCount(0);
      await expect(page.getByText(AUTH_REQUIRED_TOAST)).toHaveCount(0);
      await expect(page.locator(VISIBLE_SPINNER)).toHaveCount(0);

      const authCookies = (await context.cookies('http://localhost:3000')).filter((cookie) =>
        /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name),
      );
      expect(authCookies.length).toBeGreaterThan(0);
      for (const cookie of authCookies) {
        expect(cookie.path).toBe('/');
        expect(cookie.httpOnly, '브라우저 클라이언트가 읽어야 하므로 HttpOnly가 아니어야 한다').toBe(
          false,
        );
      }

      await page.goto('/onboarding');
      await expect(page.getByRole('heading', { name: /역할을 선택해 주세요/ })).toBeVisible({
        timeout: 8000,
      });
      await expect(page.getByText(SESSION_FAIL_COPY)).toHaveCount(0);
      await expect(page.locator(VISIBLE_SPINNER)).toHaveCount(0);
    } finally {
      if (userId) {
        await admin.auth.admin.deleteUser(userId);
        await admin.from('profiles').delete().eq('id', userId);
      }
    }
  });

  test('a) admin@demo.com 이메일 로그인은 튕김 없이 유지되고 관리자 메뉴가 보인다', async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    const passwordGrant: number[] = [];
    page.on('response', (response) => {
      if (response.url().includes('/auth/v1/token?grant_type=password')) {
        passwordGrant.push(response.status());
      }
    });

    await page.goto('/login');
    await expect(page.locator('form button[type=submit]')).toBeEnabled();
    await page.waitForLoadState('networkidle');
    await page.getByLabel('이메일').fill('admin@demo.com');
    await page.getByLabel('비밀번호').fill('demo1234');
    await page.locator('form button[type=submit]').click();

    await expect(page).toHaveURL(/\/admin(\?|$)/, { timeout: 15000 });
    expect(passwordGrant).toEqual([200]);
    const header = page.locator('header');
    await expect(header.getByRole('link', { name: '관리자', exact: true }).first()).toBeVisible();
    await expect(header.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();
    expect(await sessionUserId(context)).toBeTruthy();

    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/admin(\?|$)/);
    await expect(header.getByRole('button', { name: '로그아웃', exact: true })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/admin(\?|$)/);
    await expect(header.getByRole('link', { name: '관리자', exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('form button[type=submit]')).toHaveCount(0);
  });

  test('e) 이메일 없는 카카오 계정의 대표 이메일로 나중에 가입한 구글 계정이 병합·삭제된다', async ({
    page,
    context,
  }) => {
    test.setTimeout(120_000);
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 실유저 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const stamp = Date.now();
    const contactEmail = `e2e.contact.${stamp}@sponsor-auction.test`;
    const kakao = await admin.auth.admin.createUser({
      email: `user.${stamp.toString(16)}k@oauth.sponsor-auction.local`,
      email_confirm: true,
      app_metadata: { provider: 'kakao', providers: ['kakao'] },
      user_metadata: { name: 'E2E 카카오 대표' },
    });
    expect(kakao.error, kakao.error?.message).toBeNull();
    const kakaoId = kakao.data.user?.id ?? '';
    const google = await admin.auth.admin.createUser({
      email: `e2e.google.${stamp}@sponsor-auction.test`,
      email_confirm: true,
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: { name: 'E2E 구글' },
    });
    expect(google.error, google.error?.message).toBeNull();
    const googleId = google.data.user?.id ?? '';

    const loginAs = async (email: string, next: string) => {
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      await page.goto(
        `/auth/oauth?token_hash=${link.data.properties?.hashed_token}&type=magiclink&next=${encodeURIComponent(next)}`,
      );
    };

    try {
      await loginAs(kakao.data.user?.email ?? '', '/onboarding');
      await expect(page.getByRole('heading', { name: /역할을 선택해 주세요/ })).toBeVisible({
        timeout: 15000,
      });
      await page.getByLabel('대표 이메일').fill(contactEmail);
      await page.getByRole('button', { name: /크리에이터로 시작하기/ }).click();
      await expect(page).not.toHaveURL(/\/onboarding/, { timeout: 15000 });
      const onboarded = (await admin.auth.admin.getUserById(kakaoId)).data.user;
      expect(onboarded?.app_metadata?.contact_email).toBe(contactEmail);
      // Admin API로는 실제 카카오 identity를 만들 수 없고, 매직링크 로그인 시 GoTrue가 providers를 email로 재계산한다.
      await admin.auth.admin.updateUserById(kakaoId, {
        app_metadata: { provider: 'kakao', providers: ['kakao'] },
      });

      await context.clearCookies();
      await loginAs(google.data.user?.email ?? '', '/onboarding');
      await expect(page.getByRole('heading', { name: /역할을 선택해 주세요/ })).toBeVisible({
        timeout: 15000,
      });
      expect(await sessionUserId(context)).toBe(googleId);
      await page.getByLabel('대표 이메일').fill(contactEmail);
      await page.getByRole('button', { name: /광고주로 시작하기/ }).click();
      await expect(page.getByRole('heading', { name: '이미 가입된 계정이 있습니다' })).toHaveCount(0);
      await expect(page).not.toHaveURL(/\/auth\/oauth|\/onboarding|\/login/, { timeout: 20000 });
      expect(await sessionUserId(context)).toBe(kakaoId);

      expect((await admin.auth.admin.getUserById(googleId)).data.user).toBeNull();
      const googleProfile = await admin.from('profiles').select('id').eq('id', googleId);
      expect(googleProfile.data ?? []).toHaveLength(0);
      const kakaoProfile = await admin
        .from('profiles')
        .select('email, roles')
        .eq('id', kakaoId)
        .single();
      expect(kakaoProfile.data?.email).toBe(contactEmail);
      expect(kakaoProfile.data?.roles).toEqual(expect.arrayContaining(['creator']));
    } finally {
      for (const id of [googleId, kakaoId]) {
        if (id) {
          await admin.auth.admin.deleteUser(id);
          await admin.from('profiles').delete().eq('id', id);
        }
      }
    }
  });

  test('d) 다른 소셜 수단 신규 계정이 온보딩 대표 이메일로 기존 계정에 병합되고 중복 유저가 삭제된다', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000);
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 실유저 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const stamp = Date.now();
    const canonicalEmail = `e2e.canonical.${stamp}@sponsor-auction.test`;
    const canonical = await admin.auth.admin.createUser({
      email: canonicalEmail,
      email_confirm: true,
      app_metadata: { provider: 'google', providers: ['google'] },
      user_metadata: {
        name: 'E2E 대표계정',
        roles: ['advertiser', 'creator'],
        role: 'advertiser',
        current_mode: 'creator',
        onboarding_complete: true,
      },
    });
    expect(canonical.error, canonical.error?.message).toBeNull();
    const canonicalId = canonical.data.user?.id ?? '';
    await admin
      .from('profiles')
      .update({ role: 'advertiser', roles: ['advertiser', 'creator'] })
      .eq('id', canonicalId);

    const incoming = await admin.auth.admin.createUser({
      email: `user.${stamp.toString(16)}e2e@oauth.sponsor-auction.local`,
      email_confirm: true,
      app_metadata: { provider: 'kakao', providers: ['kakao'] },
      user_metadata: { name: 'E2E 카카오' },
    });
    expect(incoming.error, incoming.error?.message).toBeNull();
    const incomingId = incoming.data.user?.id ?? '';

    try {
      const incomingLink = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email: incoming.data.user?.email ?? '',
      });
      await page.goto(
        `/auth/oauth?token_hash=${incomingLink.data.properties?.hashed_token}&type=magiclink&next=${encodeURIComponent('/onboarding')}`,
      );
      await expect(page.getByRole('heading', { name: /역할을 선택해 주세요/ })).toBeVisible({
        timeout: 15000,
      });
      expect(await sessionUserId(context)).toBe(incomingId);

      await page.getByLabel('대표 이메일').fill(canonicalEmail);
      await page.getByRole('button', { name: /광고주로 시작하기/ }).click();
      await expect(page.getByRole('heading', { name: '이미 가입된 계정이 있습니다' })).toHaveCount(0);
      await expect(page).not.toHaveURL(/\/auth\/oauth|\/onboarding|\/login/, { timeout: 20000 });
      expect(await sessionUserId(context)).toBe(canonicalId);

      const deletedUser = await admin.auth.admin.getUserById(incomingId);
      expect(deletedUser.data.user, '중복 auth.users 행은 삭제되어야 한다').toBeNull();
      const deletedProfile = await admin.from('profiles').select('id').eq('id', incomingId);
      expect(deletedProfile.data ?? []).toHaveLength(0);

      const merged = (await admin.auth.admin.getUserById(canonicalId)).data.user;
      expect(merged?.user_metadata?.current_mode).toBe('creator');
      expect(merged?.app_metadata?.pending_merge ?? null).toBeNull();
      const mergedProfile = await admin
        .from('profiles')
        .select('roles')
        .eq('id', canonicalId)
        .single();
      expect(mergedProfile.data?.roles).toEqual(expect.arrayContaining(['advertiser', 'creator']));
      expect(
        (await context.cookies('http://localhost:3000')).some(
          (cookie) => cookie.name === 'sponsor-auction-merge-from',
        ),
      ).toBe(false);

      const switcher = page.getByRole('group', { name: '역할 전환' }).first();
      await expect(switcher).toBeVisible({ timeout: 10000 });
      await expect(switcher.getByRole('button', { name: '크리에이터 모드' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await switcher.getByRole('button', { name: '광고주 모드' }).click();
      await expect(switcher.getByRole('button', { name: '광고주 모드' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    } finally {
      for (const id of [incomingId, canonicalId]) {
        if (id) {
          await admin.auth.admin.deleteUser(id);
          await admin.from('profiles').delete().eq('id', id);
        }
      }
    }
  });

  test('c) 세션이 없을 때도 온보딩은 무한 스피너 없이 안내 화면으로 끝난다', async ({ page }) => {
    await page.goto('/onboarding');
    await expect(page).toHaveURL(/\/onboarding\/role-select/);
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator(VISIBLE_SPINNER)).toHaveCount(0);
    await expect(page.getByText(AUTH_REQUIRED_TOAST)).toHaveCount(0);
  });
});
