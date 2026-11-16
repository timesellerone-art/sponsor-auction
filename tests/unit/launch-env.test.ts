import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isLiveTossClientKey,
  isLiveTossSecret,
  isProductionRuntime,
  isTestTossClientKey,
  isTestTossSecret,
  isVercelProduction,
  missingProductionEnvKeys,
  productionTossLiveKeyError,
} from '../../src/lib/launch-env';

describe('production launch env', () => {
  it('placeholder와 빈 값은 누락으로 본다', () => {
    const missing = missingProductionEnvKeys({
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-value-at-least-20',
      SUPABASE_SERVICE_ROLE_KEY: 'YOUR_SUPABASE_SERVICE_ROLE_KEY',
      NEXT_PUBLIC_TOSS_CLIENT_KEY: 'live_gck_example',
      TOSS_SECRET_KEY: 'live_gsk_example',
      NAVER_CLIENT_ID: 'naver-id',
      NAVER_CLIENT_SECRET: 'naver-secret',
    });
    assert.deepEqual(missing, ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_WEBHOOK_SECRET']);
  });

  it('Toss live/test 접두사만 구분한다', () => {
    assert.equal(isLiveTossSecret('live_gsk_example'), true);
    assert.equal(isTestTossSecret('test_gsk_example'), true);
    assert.equal(isLiveTossClientKey('live_gck_example'), true);
    assert.equal(isTestTossClientKey('test_gck_example'), true);
    assert.equal(isProductionRuntime({ NODE_ENV: 'production' }), true);
    assert.equal(isProductionRuntime({ NODE_ENV: 'development' }), false);
  });

  it('Vercel Production에서만 test_ 키를 거절한다', () => {
    assert.equal(isVercelProduction({ VERCEL_ENV: 'production' }), true);
    assert.equal(isVercelProduction({ VERCEL_ENV: 'preview' }), false);
    assert.equal(
      productionTossLiveKeyError(
        { VERCEL_ENV: 'production' },
        { clientKey: 'test_gck_x', secretKey: 'test_gsk_x' },
      ),
      'TOSS_TEST_KEY_IN_PRODUCTION',
    );
    assert.equal(
      productionTossLiveKeyError(
        { VERCEL_ENV: 'preview' },
        { clientKey: 'test_gck_x', secretKey: 'test_gsk_x' },
      ),
      null,
    );
    assert.equal(
      productionTossLiveKeyError(
        { VERCEL_ENV: 'production' },
        { clientKey: 'live_gck_x', secretKey: 'live_gsk_x' },
      ),
      null,
    );
    assert.equal(
      productionTossLiveKeyError(
        { VERCEL_ENV: 'production' },
        { clientKey: 'live_gck_x', secretKey: '' },
      ),
      'TOSS_LIVE_KEY_MISSING',
    );
  });
});
