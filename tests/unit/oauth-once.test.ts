import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isOAuthStateLost, isUsedOrExpiredOAuthCode } from '../../src/lib/auth-guard';
import { resetOAuthAttempts, shareOAuthAttempt } from '../../src/lib/oauth-once';

describe('OAuth 코드 멱등 처리', () => {
  it('이미 사용한 코드 오류를 만료로 본다', () => {
    assert.equal(isUsedOrExpiredOAuthCode('Invalid grant: grant is expired or already used'), true);
    assert.equal(isUsedOrExpiredOAuthCode('invalid_grant'), true);
    assert.equal(isUsedOrExpiredOAuthCode('Email link is invalid or has expired'), true);
    assert.equal(isUsedOrExpiredOAuthCode(null, 'otp_expired'), true);
    assert.equal(isOAuthStateLost('bad_oauth_state', 'OAuth state not found or expired'), true);
    assert.equal(
      isUsedOrExpiredOAuthCode('OAuth state not found or expired', 'bad_oauth_state'),
      false,
    );
    assert.equal(isUsedOrExpiredOAuthCode('Database error saving new user'), false);
  });

  it('같은 키의 중복 실행은 한 번만 수행한다', async () => {
    resetOAuthAttempts();
    let runs = 0;
    const first = shareOAuthAttempt('code-1', async () => {
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { ok: true, runs };
    });
    const second = shareOAuthAttempt('code-1', async () => {
      runs += 1;
      return { ok: false, runs };
    });
    const [a, b] = await Promise.all([first, second]);
    assert.equal(runs, 1);
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    resetOAuthAttempts();
  });

  it('실패한 교환은 캐시하지 않아 다음 요청이 세션 복구를 시도할 수 있다', async () => {
    resetOAuthAttempts();
    let runs = 0;
    await assert.rejects(
      shareOAuthAttempt('code-fail', async () => {
        runs += 1;
        throw new Error('invalid_grant');
      }),
      /invalid_grant/,
    );
    const recovered = await shareOAuthAttempt('code-fail', async () => {
      runs += 1;
      return { ok: true };
    });
    assert.equal(runs, 2);
    assert.equal(recovered.ok, true);
    resetOAuthAttempts();
  });
});
