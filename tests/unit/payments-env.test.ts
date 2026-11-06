import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getPaymentSigningSecret } from '../../src/lib/payments/env';

describe('payment signing secret', () => {
  it('개발 환경에서 Toss/서비스 키가 없으면 데모 서명 키를 쓴다', () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = {
      NODE_ENV: env.NODE_ENV,
      TOSS_SECRET_KEY: env.TOSS_SECRET_KEY,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    };
    env.NODE_ENV = 'development';
    delete env.TOSS_SECRET_KEY;
    delete env.SUPABASE_SERVICE_ROLE_KEY;
    delete env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    try {
      assert.equal(getPaymentSigningSecret(), 'sponsor-auction-demo-payment');
    } finally {
      env.NODE_ENV = previous.NODE_ENV;
      if (previous.TOSS_SECRET_KEY) env.TOSS_SECRET_KEY = previous.TOSS_SECRET_KEY;
      if (previous.SUPABASE_SERVICE_ROLE_KEY) {
        env.SUPABASE_SERVICE_ROLE_KEY = previous.SUPABASE_SERVICE_ROLE_KEY;
      }
      if (previous.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
        env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previous.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      }
    }
  });
});
