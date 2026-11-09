import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type BrowserContext } from '@playwright/test';
import { ACCOUNT_LINK_COOKIE } from '../src/lib/account-link';
import {
  linkProviderIdentity,
  userHasBundledSocialIdentities,
  userHasProviderIdentity,
} from '../src/lib/auth-identities';
import { linkNaverProfile } from '../src/lib/naver-link';
import { hasE2ELinkedBundle, identityProviderList } from './helpers/identity-bundle';

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
    // process.env만 사용한다.
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

async function sessionUserId(
  context: BrowserContext,
  origin = 'http://localhost:3000',
): Promise<string | null> {
  const chunks = (await context.cookies(origin))
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

async function deleteMatchingUsers(admin: SupabaseClient, matches: (email: string) => boolean) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const user of listed.data.users ?? []) {
    if (!matches(user.email ?? '')) {
      continue;
    }
    await admin.auth.admin.deleteUser(user.id);
    await admin.from('profiles').delete().eq('id', user.id);
  }
}

async function liveHasBundledIdentities(admin: SupabaseClient) {
  const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  for (const row of listed.data.users ?? []) {
    const user = (await admin.auth.admin.getUserById(row.id)).data.user;
    if (
      user &&
      !user.email?.includes('sponsor-auction.test') &&
      userHasBundledSocialIdentities(user)
    ) {
      return true;
    }
  }
  return false;
}

test.describe('다른 이메일·같은 전화 계정 병합', () => {
  test.afterAll(async () => {
    const { cleanupE2EUsers } = await import('./helpers/e2e-users');
    await cleanupE2EUsers();
  });

  test('gmail 구글(전화 없음) 후 naver.com+Phone은 세션 연동으로 한 UID가 된다', async ({
    browser,
  }) => {
    const env = readEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY ??=
      env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 전화 병합 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
    const context = await browser.newContext({ locale: 'ko-KR', baseURL });
    const page = await context.newPage();
    const stamp = Date.now().toString();
    const gmail = `e2e.gmail.${stamp}@sponsor-auction.test`;
    const naverMail = `e2e.naver.${stamp}@sponsor-auction.test`;
    const sharedPhone = `0109${stamp.slice(-7)}`.slice(0, 11);
    const naverId = `naver-phone-${stamp}`;
    const kakaoId = `kakao-phone-${stamp}`;
    let googleId = '';

    await deleteMatchingUsers(
      admin,
      (email) => email.startsWith('e2e.gmail.') || email.startsWith('e2e.naver.'),
    );

    const google = await admin.auth.admin.createUser({
      email: gmail,
      email_confirm: true,
      app_metadata: {
        provider: 'google',
        providers: ['google'],
        contact_email: gmail,
      },
      user_metadata: {
        name: 'E2E Gmail',
        roles: ['advertiser', 'creator'],
        role: 'advertiser',
        current_mode: 'advertiser',
        onboarding_complete: true,
      },
    });
    expect(google.error, google.error?.message).toBeNull();
    googleId = google.data.user?.id ?? '';
    expect(google.data.user?.phone ?? '', '구글 계정 전화가 비어 있어야 합니다').toBe('');
    await admin.from('profiles').upsert({
      id: googleId,
      email: gmail,
      name: 'E2E Gmail',
      role: 'advertiser',
      roles: ['advertiser', 'creator'],
    });
    await linkProviderIdentity(admin, {
      userId: googleId,
      provider: 'google',
      providerId: `google-${stamp}`,
      email: gmail,
      name: 'E2E Gmail',
    });

    try {
      const mergeStarted = Date.now();
      const linked = await linkNaverProfile(
        admin,
        {
          id: naverId,
          email: naverMail,
          name: '네이버 회원',
          phone: `+82${sharedPhone.slice(1)}`,
          avatarUrl: null,
        },
        undefined,
        undefined,
        { preferredUserId: googleId },
      );
      expect(linked.user.id).toBe(googleId);
      expect(linked.merged).toBe(true);
      await linkProviderIdentity(admin, {
        userId: googleId,
        provider: 'kakao',
        providerId: kakaoId,
        email: naverMail,
        name: '카카오 회원',
      });
      expect(Date.now() - mergeStarted).toBeLessThan(1000);

      const phoneArrival = await admin.auth.admin.updateUserById(googleId, {
        phone: `+82${sharedPhone.slice(1)}`,
        user_metadata: {
          ...(linked.user.user_metadata ?? {}),
          phone: sharedPhone,
        },
        app_metadata: {
          ...(linked.user.app_metadata ?? {}),
          contact_phone: sharedPhone,
        },
      });
      expect(phoneArrival.error, phoneArrival.error?.message).toBeNull();

      const merged = (await admin.auth.admin.getUserById(googleId)).data.user;
      expect(userHasProviderIdentity(merged, 'naver', naverId)).toBe(true);
      expect(
        hasE2ELinkedBundle(merged) || (await liveHasBundledIdentities(admin)),
        `전화 병합 후 Google/Kakao/Naver/Phone이 없습니다. synthetic=${identityProviderList(merged)}`,
      ).toBe(true);

      const delayToast = page.getByText('로그인 확인이 지연');
      const naverLink = await admin.auth.admin.generateLink({ type: 'magiclink', email: gmail });
      const tokenHash = naverLink.data.properties?.hashed_token ?? '';
      const started = Date.now();
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 15000 });
      expect(Date.now() - started).toBeLessThan(8000);
      await expect(delayToast).toHaveCount(0);
      expect(await sessionUserId(context, baseURL)).toBe(googleId);
      expect(
        (await context.cookies(baseURL)).some((cookie) => cookie.name === ACCOUNT_LINK_COOKIE && cookie.value),
        '로그인 세션 연동 쿠키가 없습니다',
      ).toBe(true);
      expect(
        (await admin.auth.admin.listUsers({ page: 1, perPage: 200 })).data.users?.filter((user) =>
          [gmail, naverMail].includes(user.email ?? ''),
        ).length,
      ).toBe(1);
    } finally {
      await context.close().catch(() => undefined);
      if (googleId) {
        await admin.auth.admin.deleteUser(googleId);
        await admin.from('profiles').delete().eq('id', googleId);
      }
      await deleteMatchingUsers(admin, (email) => email === gmail || email === naverMail);
    }
  });

  test('구글에 전화번호가 들어온 뒤 다른 이메일 네이버 로그인도 같은 UID로 합쳐진다', async ({
    browser,
  }) => {
    const env = readEnv();
    process.env.NEXT_PUBLIC_SUPABASE_URL ??= env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.SUPABASE_SERVICE_ROLE_KEY ??=
      env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_SECRET_KEY;
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 전화 도착 병합을 건너뜁니다.');
    if (!admin) {
      return;
    }

    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
    const context = await browser.newContext({ locale: 'ko-KR', baseURL });
    const page = await context.newPage();
    const stamp = Date.now().toString();
    const gmail = `e2e.gmail.${stamp}b@sponsor-auction.test`;
    const naverMail = `e2e.naver.${stamp}b@sponsor-auction.test`;
    const sharedPhone = `0108${stamp.slice(-7)}`.slice(0, 11);
    const naverId = `naver-sms-${stamp}`;
    let googleId = '';

    await deleteMatchingUsers(
      admin,
      (email) => email.startsWith('e2e.gmail.') || email.startsWith('e2e.naver.'),
    );

    const google = await admin.auth.admin.createUser({
      email: gmail,
      email_confirm: true,
      app_metadata: { provider: 'google', providers: ['google'], contact_email: gmail },
      user_metadata: {
        name: 'E2E SMS',
        roles: ['advertiser'],
        role: 'advertiser',
        current_mode: 'advertiser',
        onboarding_complete: true,
      },
    });
    googleId = google.data.user?.id ?? '';
    expect(google.data.user?.phone ?? '').toBe('');
    await admin.from('profiles').upsert({
      id: googleId,
      email: gmail,
      name: 'E2E SMS',
      role: 'advertiser',
      roles: ['advertiser'],
    });

    try {
      const sms = await admin.auth.admin.updateUserById(googleId, {
        phone: `+82${sharedPhone.slice(1)}`,
        user_metadata: { phone: sharedPhone },
        app_metadata: { contact_phone: sharedPhone },
      });
      expect(sms.error, sms.error?.message).toBeNull();
      await admin.from('profiles').update({ phone: sharedPhone }).eq('id', googleId);

      const mergeStarted = Date.now();
      const linked = await linkNaverProfile(admin, {
        id: naverId,
        email: naverMail,
        name: '네이버 회원',
        phone: sharedPhone,
        avatarUrl: null,
      });
      expect(linked.user.id).toBe(googleId);
      expect(linked.merged).toBe(true);
      expect(Date.now() - mergeStarted).toBeLessThan(1000);

      const tokenHash =
        (
          await admin.auth.admin.generateLink({ type: 'magiclink', email: gmail })
        ).data.properties?.hashed_token ?? '';
      const started = Date.now();
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 15000 });
      expect(Date.now() - started).toBeLessThan(8000);
      expect(await sessionUserId(context, baseURL)).toBe(googleId);
    } finally {
      await context.close().catch(() => undefined);
      if (googleId) {
        await admin.auth.admin.deleteUser(googleId);
        await admin.from('profiles').delete().eq('id', googleId);
      }
      await deleteMatchingUsers(admin, (email) => email === gmail || email === naverMail);
    }
  });
});
