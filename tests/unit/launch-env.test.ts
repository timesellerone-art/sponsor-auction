import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isLiveTossSecret,
  isProductionRuntime,
  isTestTossSecret,
  missingProductionEnvKeys,
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
    assert.equal(isProductionRuntime({ NODE_ENV: 'production' }), true);
    assert.equal(isProductionRuntime({ NODE_ENV: 'development' }), false);
  });
});
