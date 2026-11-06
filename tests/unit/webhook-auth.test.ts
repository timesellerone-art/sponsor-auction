import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { verifyWebhookSecret } from '../../src/lib/webhook-auth';

describe('webhook auth', () => {
  it('개발 환경에서 시크릿이 없으면 mock으로 통과한다', () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    const secret = env.SUPABASE_WEBHOOK_SECRET;
    const alias = env.WEBHOOK_SECRET;
    env.NODE_ENV = 'development';
    delete env.SUPABASE_WEBHOOK_SECRET;
    delete env.WEBHOOK_SECRET;
    try {
      const result = verifyWebhookSecret(new Request('http://localhost/api/webhooks/supabase'));
      assert.equal(result.ok, true);
      assert.equal(result.mocked, true);
    } finally {
      env.NODE_ENV = previous;
      if (secret) env.SUPABASE_WEBHOOK_SECRET = secret;
      if (alias) env.WEBHOOK_SECRET = alias;
    }
  });

  it('운영 환경에서 시크릿이 없으면 거절한다', () => {
    const env = process.env as Record<string, string | undefined>;
    const previous = env.NODE_ENV;
    const secret = env.SUPABASE_WEBHOOK_SECRET;
    const alias = env.WEBHOOK_SECRET;
    env.NODE_ENV = 'production';
    delete env.SUPABASE_WEBHOOK_SECRET;
    delete env.WEBHOOK_SECRET;
    try {
      const result = verifyWebhookSecret(new Request('http://localhost/api/webhooks/supabase'));
      assert.equal(result.ok, false);
      assert.equal('missingSecret' in result && result.missingSecret, true);
    } finally {
      env.NODE_ENV = previous;
      if (secret) env.SUPABASE_WEBHOOK_SECRET = secret;
      if (alias) env.WEBHOOK_SECRET = alias;
    }
  });

  it('헤더 시크릿이 일치할 때만 통과한다', () => {
    const previous = process.env.SUPABASE_WEBHOOK_SECRET;
    process.env.SUPABASE_WEBHOOK_SECRET = 'unit-webhook-secret';
    try {
      const denied = verifyWebhookSecret(
        new Request('http://localhost/api/webhooks/supabase', {
          headers: { 'x-webhook-secret': 'wrong' },
        }),
      );
      const allowed = verifyWebhookSecret(
        new Request('http://localhost/api/webhooks/supabase', {
          headers: { 'x-webhook-secret': 'unit-webhook-secret' },
        }),
      );
      assert.equal(denied.ok, false);
      assert.equal(allowed.ok, true);
      assert.equal(allowed.mocked, false);
    } finally {
      if (previous) {
        process.env.SUPABASE_WEBHOOK_SECRET = previous;
      } else {
        delete process.env.SUPABASE_WEBHOOK_SECRET;
      }
    }
  });
});
