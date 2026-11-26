import { createHash, randomInt, timingSafeEqual } from 'crypto';
import type { User } from '@supabase/supabase-js';
import { isValidPhone, normalizePhone, sameKrPhone } from '@/lib/contact';

export { PHONE_OTP_TEST_CODE, PHONE_OTP_TEST_MODE_MESSAGE } from '@/lib/phone-otp-constants';

export const PHONE_OTP_TTL_MS = 5 * 60 * 1000;
export const PHONE_OTP_RESEND_MS = 30_000;
export const PHONE_OTP_MAX_ATTEMPTS = 5;
export const PHONE_OTP_LENGTH = 6;

export function normalizePhoneOtpCode(code: string) {
  return code.replace(/\D/g, '').slice(0, PHONE_OTP_LENGTH);
}

export function generatePhoneOtpCode() {
  return String(randomInt(0, 1_000_000)).padStart(PHONE_OTP_LENGTH, '0');
}

export function hashPhoneOtp(code: string, phone: string) {
  const normalizedCode = normalizePhoneOtpCode(code);
  const normalizedPhone = normalizePhone(phone);
  return createHash('sha256').update(`${normalizedPhone}:${normalizedCode}`).digest('hex');
}

export function phoneOtpHashesMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

function metaString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function metaNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0;
}

export function readPhoneOtpMeta(user: User) {
  const meta = user.user_metadata ?? {};
  return {
    hash: metaString(meta.phone_otp_hash),
    phone: normalizePhone(metaString(meta.phone_otp_phone)),
    exp: metaNumber(meta.phone_otp_exp),
    attempts: metaNumber(meta.phone_otp_attempts),
    sentAt: metaNumber(meta.phone_otp_sent_at),
  };
}

export function isVerifiedServicePhone(user: User, phone: string) {
  if (user.user_metadata?.phone_verified !== true) {
    return false;
  }
  return (
    sameKrPhone(phone, user.phone) ||
    sameKrPhone(phone, metaString(user.app_metadata?.contact_phone)) ||
    sameKrPhone(phone, metaString(user.user_metadata?.phone))
  );
}

export function assertSendablePhone(rawPhone: string) {
  const phone = normalizePhone(rawPhone);
  if (!phone || !isValidPhone(phone)) {
    throw new Error('올바른 휴대전화 번호를 입력해 주세요.');
  }
  return phone;
}

export function assertPhoneOtpCode(user: User, rawPhone: string, rawCode: string) {
  const phone = assertSendablePhone(rawPhone);
  const code = normalizePhoneOtpCode(rawCode);
  const otp = readPhoneOtpMeta(user);
  if (!otp.hash || !otp.phone) {
    throw new Error('인증번호를 먼저 받아 주세요.');
  }
  if (!sameKrPhone(phone, otp.phone)) {
    throw new Error('인증받은 번호와 다릅니다. 인증번호를 다시 받아 주세요.');
  }
  if (Date.now() > otp.exp) {
    throw new Error('인증번호가 만료되었습니다. 다시 받아 주세요.');
  }
  if (otp.attempts >= PHONE_OTP_MAX_ATTEMPTS) {
    throw new Error('인증 시도 횟수를 초과했습니다. 인증번호를 다시 받아 주세요.');
  }
  if (code.length !== PHONE_OTP_LENGTH) {
    throw new Error('인증번호 6자리를 입력해 주세요.');
  }
  if (!phoneOtpHashesMatch(otp.hash, hashPhoneOtp(code, phone))) {
    const error = new Error('인증번호가 올바르지 않습니다.') as Error & { otpFailed?: boolean };
    error.otpFailed = true;
    throw error;
  }
  return phone;
}

export function canResendPhoneOtp(user: User, now = Date.now()) {
  const sentAt = readPhoneOtpMeta(user).sentAt;
  if (!sentAt) {
    return true;
  }
  return now - sentAt >= PHONE_OTP_RESEND_MS;
}

export function clearedPhoneOtpMetadata(
  user: User,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...(user.user_metadata ?? {}),
    phone_otp_hash: null,
    phone_otp_phone: null,
    phone_otp_exp: null,
    phone_otp_attempts: null,
    phone_otp_sent_at: null,
    ...extra,
  };
}
