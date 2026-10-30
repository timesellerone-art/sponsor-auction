import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';

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

test.describe('역할 전환 속도', () => {
  test('광고주↔크리에이터 전환이 리로드·스켈레톤 없이 1초 안에 끝난다', async ({ page }) => {
    const admin = adminClient();
    test.skip(!admin, 'SUPABASE_SERVICE_ROLE_KEY가 없어 역할 전환 시나리오를 건너뜁니다.');
    if (!admin) {
      return;
    }

    const email = `e2e.roleswitch.${Date.now()}@sponsor-auction.test`;
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        name: 'E2E 역할전환',
        roles: ['advertiser', 'creator'],
        role: 'advertiser',
        current_mode: 'advertiser',
        onboarding_complete: true,
      },
    });
    expect(created.error, created.error?.message).toBeNull();
    const userId = created.data.user?.id ?? '';
    await admin.from('profiles').upsert({
      id: userId,
      email,
      name: 'E2E 역할전환',
      role: 'advertiser',
      roles: ['advertiser', 'creator'],
    });

    try {
      const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      const tokenHash = link.data.properties?.hashed_token ?? '';
      await page.goto(
        `/auth/oauth?token_hash=${encodeURIComponent(tokenHash)}&type=magiclink&next=${encodeURIComponent('/my')}`,
      );
      await expect(page).toHaveURL(/\/my/, { timeout: 20000 });
      await expect(page.getByRole('heading', { name: '내 역경매' })).toBeVisible({
        timeout: 15000,
      });

      const switcher = page.getByRole('group', { name: '역할 전환' }).first();
      await expect(switcher.getByRole('button', { name: '광고주 모드' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );

      const started = Date.now();
      await switcher.getByRole('button', { name: '크리에이터 모드' }).click();
      await expect(page.getByRole('heading', { name: '내 제안' })).toBeVisible();
      expect(Date.now() - started).toBeLessThan(1000);
      await expect(page).toHaveURL(/\/my/);
      await expect(page.locator('main .animate-pulse')).toHaveCount(0);

      const back = Date.now();
      await switcher.getByRole('button', { name: '광고주 모드' }).click();
      await expect(page.getByRole('heading', { name: '내 역경매' })).toBeVisible();
      expect(Date.now() - back).toBeLessThan(1000);
      await expect(page.locator('main .animate-pulse')).toHaveCount(0);
    } finally {
      if (userId) {
        await admin.auth.admin.deleteUser(userId);
        await admin.from('profiles').delete().eq('id', userId);
      }
    }
  });
});
