import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { getSupabaseEnv } from '../../src/lib/supabase/env';

const URL_KEY = 'NEXT_PUBLIC_SUPABASE_URL';
const ANON_KEY = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
const PUBLISHABLE_KEY = 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY';
const REAL_URL = 'https://example.supabase.co';
const REAL_KEY = 'sb_publishable_example_key_value';

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

describe('supabase public env', () => {
  const previous = {
    url: process.env[URL_KEY],
    anon: process.env[ANON_KEY],
    publishable: process.env[PUBLISHABLE_KEY],
  };

  afterEach(() => {
    restore(URL_KEY, previous.url);
    restore(ANON_KEY, previous.anon);
    restore(PUBLISHABLE_KEY, previous.publishable);
    delete (globalThis as { window?: unknown }).window;
  });

  it('익명 키가 없어도 publishable 키로 클라이언트를 만든다', () => {
    process.env[URL_KEY] = REAL_URL;
    delete process.env[ANON_KEY];
    process.env[PUBLISHABLE_KEY] = REAL_KEY;
    assert.deepEqual(getSupabaseEnv(), { url: REAL_URL, anonKey: REAL_KEY });
  });

  it('빌드에 키가 없으면 서버가 심은 브라우저 설정을 쓴다', () => {
    delete process.env[URL_KEY];
    delete process.env[ANON_KEY];
    delete process.env[PUBLISHABLE_KEY];
    (globalThis as { window?: unknown }).window = {
      __CLINK_SUPABASE__: { url: REAL_URL, anonKey: REAL_KEY },
    };
    assert.deepEqual(getSupabaseEnv(), { url: REAL_URL, anonKey: REAL_KEY });
  });
});