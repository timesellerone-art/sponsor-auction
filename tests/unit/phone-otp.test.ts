import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { User } from '@supabase/supabase-js';
import { ACCOUNT_UNIFIED_MESSAGE } from '../../src/lib/account-unify';
import { hasSolapiSmsConfig } from '../../src/lib/notification';
import { PHONE_OTP_TEST_CODE, PHONE_OTP_TEST_MODE_MESSAGE } from '../../src/lib/phone-otp-constants';
import {
  assertPhoneOtpCode,
  canResendPhoneOtp,
  hashPhoneOtp,
  isVerifiedServicePhone,
  phoneOtpHashesMatch,
} from '../../src/lib/phone-otp';

function userWithMeta(meta: Record<string, unknown>, extra: Partial<User> = {}): User {
  return {
    id: 'usr-1',
    app_metadata: extra.app_metadata ?? {},
    user_metadata: meta,
    aud: 'authenticated',
    created_at: '2026-11-01T00:00:00.000Z',
    ...extra,
  } as User;
}

describe('phone otp', () => {
  it('같은 번호·코드만 해시가 일치한다', () => {
    const hash = hashPhoneOtp('123456', '010-1234-5678');
    assert.equal(phoneOtpHashesMatch(hash, hashPhoneOtp('123456', '01012345678')), true);
    assert.equal(phoneOtpHashesMatch(hash, hashPhoneOtp('123456', '01099998888')), false);
    assert.equal(phoneOtpHashesMatch(hash, hashPhoneOtp('000000', '01012345678')), false);
  });

  it('저장된 OTP를 검증하고 만료·불일치를 거절한다', () => {
    const phone = '01012345678';
    const code = '847291';
    const valid = userWithMeta({
      phone_otp_hash: hashPhoneOtp(code, phone),
      phone_otp_phone: phone,
      phone_otp_exp: Date.now() + 60_000,
      phone_otp_attempts: 0,
    });
    assert.equal(assertPhoneOtpCode(valid, '010-1234-5678', code), phone);

    const expired = userWithMeta({
      ...valid.user_metadata,
      phone_otp_exp: Date.now() - 1,
    });
    assert.throws(() => assertPhoneOtpCode(expired, phone, code), /만료/);
    assert.throws(() => assertPhoneOtpCode(valid, phone, '000000'), /올바르지 않습니다/);
  });

  it('서비스 휴대폰 인증 여부와 재전송 쿨다운을 본다', () => {
    const verified = userWithMeta(
      { phone_verified: true, phone: '01012345678' },
      { phone: '+821012345678', app_metadata: { contact_phone: '01012345678' } },
    );
    assert.equal(isVerifiedServicePhone(verified, '010-1234-5678'), true);
    assert.equal(isVerifiedServicePhone(verified, '01099998888'), false);
    assert.equal(isVerifiedServicePhone(userWithMeta({ phone: '01012345678' }), '01012345678'), false);

    const recent = userWithMeta({ phone_otp_sent_at: Date.now() - 5_000 });
    const ready = userWithMeta({ phone_otp_sent_at: Date.now() - 31_000 });
    assert.equal(canResendPhoneOtp(recent), false);
    assert.equal(canResendPhoneOtp(ready), true);
  });

  it('통합 안내 문구가 요청한 문장과 같다', () => {
    assert.equal(
      ACCOUNT_UNIFIED_MESSAGE,
      '이미 가입된 계정이 확인되어 기존 계정으로 통합 연결되었습니다.',
    );
  });

  it('테스트 모드 고정 인증번호 123456을 검증한다', () => {
    assert.equal(PHONE_OTP_TEST_CODE, '123456');
    assert.equal(
      PHONE_OTP_TEST_MODE_MESSAGE,
      '문자 발송 설정 전 테스트 모드입니다. 인증번호 123456을 입력해 주세요.',
    );
    const phone = '01012345678';
    const user = userWithMeta({
      phone_otp_hash: hashPhoneOtp(PHONE_OTP_TEST_CODE, phone),
      phone_otp_phone: phone,
      phone_otp_exp: Date.now() + 60_000,
      phone_otp_attempts: 0,
    });
    assert.equal(assertPhoneOtpCode(user, phone, '123456'), phone);
  });

  it('Solapi 키/시크릿이 있을 때만 실제 SMS 설정으로 본다', () => {
    assert.equal(hasSolapiSmsConfig({}), false);
    assert.equal(hasSolapiSmsConfig({ ALIGO_API_KEY: 'aligo-only' }), false);
    assert.equal(hasSolapiSmsConfig({ SOLAPI_API_KEY: 'key' }), false);
    assert.equal(hasSolapiSmsConfig({ SOLAPI_API_KEY: 'key', SOLAPI_API_SECRET: 'secret' }), true);
    assert.equal(hasSolapiSmsConfig({ SOLAPI_KEY: 'key', SOLAPI_SECRET: 'secret' }), true);
  });
});
