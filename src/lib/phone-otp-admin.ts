import 'server-only';

import type { SupabaseClient, User } from '@supabase/supabase-js';
import {
  PHONE_OTP_TTL_MS,
  assertPhoneOtpCode,
  assertSendablePhone,
  canResendPhoneOtp,
  generatePhoneOtpCode,
  hashPhoneOtp,
  readPhoneOtpMeta,
} from '@/lib/phone-otp';
import { sendSolapiSms } from '@/lib/notification';

type AdminClient = SupabaseClient;

export async function issuePhoneOtp(admin: AdminClient, user: User, rawPhone: string) {
  const phone = assertSendablePhone(rawPhone);
  if (!canResendPhoneOtp(user)) {
    throw new Error('인증번호는 30초 후에 다시 받을 수 있습니다.');
  }

  const code = generatePhoneOtpCode();
  const now = Date.now();
  const updated = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      ...(user.user_metadata ?? {}),
      phone_otp_hash: hashPhoneOtp(code, phone),
      phone_otp_phone: phone,
      phone_otp_exp: now + PHONE_OTP_TTL_MS,
      phone_otp_attempts: 0,
      phone_otp_sent_at: now,
    },
  });
  if (updated.error) {
    throw new Error(updated.error.message || '인증번호를 저장하지 못했습니다.');
  }

  const sent = await sendSolapiSms(
    phone,
    `[Clink] 인증번호 ${code}\n5분 안에 입력해 주세요.`,
  );
  if (sent.mocked) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('문자 발송 설정이 없어 인증번호를 보낼 수 없습니다.');
    }
    console.info('[SponsorAuction] 휴대폰 OTP Mock 발송', { phone, userId: user.id, code });
  }

  return { phone, mocked: sent.mocked };
}

export async function confirmPhoneOtp(admin: AdminClient, user: User, rawPhone: string, rawCode: string) {
  try {
    return assertPhoneOtpCode(user, rawPhone, rawCode);
  } catch (error) {
    if (error instanceof Error && 'otpFailed' in error && error.otpFailed) {
      const attempts = readPhoneOtpMeta(user).attempts + 1;
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata ?? {}),
          phone_otp_attempts: attempts,
        },
      });
    }
    throw error;
  }
}
