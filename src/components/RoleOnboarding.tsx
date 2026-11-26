'use client';

import { useState } from 'react';
import { Briefcase, Clapperboard, Loader2 } from 'lucide-react';
import { PhoneOtpForm } from '@/components/PhoneOtpForm';
import { showToast } from '@/components/Toast';
import { ACCOUNT_UNIFIED_MESSAGE } from '@/lib/account-unify';
import { AUTH_FAIL_MESSAGE, saveMemberRole, type PhoneVerifyResult } from '@/lib/auth';
import { isPlaceholderOAuthEmail, isValidContactEmail, isValidPhone } from '@/lib/contact';
import { cn } from '@/lib/utils';
import { isMemberRole, type MemberRole } from '@/types/auth';

type RoleOnboardingProps = {
  name: string;
  email?: string | null;
  intent?: MemberRole;
  headingLevel?: 'h1' | 'h2';
  onCompleted: (roles: MemberRole[]) => void;
};

const ROLE_OPTIONS: {
  value: MemberRole;
  title: string;
  description: string;
  icon: typeof Briefcase;
}[] = [
  {
    value: 'advertiser',
    title: '광고주로 시작하기',
    description:
      '브랜드 캠페인을 등록하는 사용자입니다. 예산을 올리고 제안서를 비교한 뒤 크리에이터(개인 또는 팀) 1곳을 선정할 수 있습니다. 계약·정산은 대표 계정 기준입니다.',
    icon: Briefcase,
  },
  {
    value: 'creator',
    title: '크리에이터(개인 또는 팀)로 시작하기',
    description:
      '오픈 캠페인에 채널과 금액으로 콘텐츠를 제안하고, 개인 또는 팀 단위로 AI 제안서와 1:1 매칭을 받을 수 있습니다.',
    icon: Clapperboard,
  },
];

export function RoleOnboarding({
  name,
  email,
  intent,
  headingLevel = 'h1',
  onCompleted,
}: RoleOnboardingProps) {
  const providerEmail = isPlaceholderOAuthEmail(email) ? '' : (email?.trim() ?? '');
  const [contactEmail, setContactEmail] = useState(providerEmail);
  const [phone, setPhone] = useState('');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [busy, setBusy] = useState<MemberRole | null>(null);
  const Heading = headingLevel;
  const options = intent ? ROLE_OPTIONS.filter((option) => option.value === intent) : ROLE_OPTIONS;
  const heading =
    intent === 'advertiser'
      ? `${name}님, 광고주 정보를 입력해 주세요`
      : intent === 'creator'
        ? `${name}님, 크리에이터 채널 정보를 입력해 주세요`
        : `${name}님, 역할을 선택해 주세요`;
  const description =
    '휴대전화 인증으로 본인을 확인합니다. 카카오·네이버·구글·이메일이 달라도 같은 번호면 하나의 계정으로 연결됩니다.';

  const finishIfExistingMember = (result: PhoneVerifyResult) => {
    setPhoneVerified(true);
    if (result.onboardingComplete && result.roles.length > 0) {
      onCompleted(result.roles);
      return true;
    }
    return false;
  };

  const handleChoose = async (role: MemberRole) => {
    if (!isMemberRole(role) || busy) {
      return;
    }
    if (!isValidContactEmail(contactEmail)) {
      showToast('대표 이메일을 입력해 주세요.');
      return;
    }
    if (!phoneVerified || !isValidPhone(phone)) {
      showToast('휴대전화 인증을 완료해 주세요.');
      return;
    }

    setBusy(role);
    try {
      const result = await saveMemberRole(role, {
        email: contactEmail.trim(),
        phone: phone.trim(),
      });
      if (result.error || !result.data) {
        showToast(result.error ?? AUTH_FAIL_MESSAGE);
        return;
      }
      if (result.merged) {
        showToast(result.message || ACCOUNT_UNIFIED_MESSAGE, 'success');
      } else {
        showToast(
          role === 'advertiser' ? '광고주로 시작합니다.' : '크리에이터로 시작합니다.',
          'success',
        );
      }
      const savedRoles = (result.data.roles ?? []).filter(isMemberRole);
      onCompleted(savedRoles.length > 0 ? savedRoles : [role]);
    } catch {
      showToast(AUTH_FAIL_MESSAGE);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-h-[min(100dvh,52rem)] w-full max-w-lg overflow-y-auto">
      <p className="text-sm font-semibold tracking-wide text-clink-accent">시작하기</p>
      <Heading className="mt-1 pr-10 text-2xl font-bold text-zinc-950">{heading}</Heading>
      <p className="mt-2 text-sm text-zinc-500">{description}</p>

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-800">대표 이메일</span>
          <input
            type="email"
            autoComplete="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950 outline-none focus:border-clink-accent focus:ring-2 focus:ring-clink-peach-strong"
            placeholder="name@example.com"
          />
        </label>
        <PhoneOtpForm
          phone={phone}
          onPhoneChange={(value) => {
            setPhone(value);
            setPhoneVerified(false);
          }}
          verified={phoneVerified}
          onVerified={(result) => {
            finishIfExistingMember(result);
          }}
          disabled={Boolean(busy)}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {options.map((option) => {
          const Icon = option.icon;
          const submitting = busy === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={Boolean(busy) || !phoneVerified}
              onClick={() => {
                void handleChoose(option.value);
              }}
              className={cn(
                'flex w-full min-w-0 items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-left hover:border-clink-accent hover:bg-clink-peach disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-clink-peach text-clink-accent">
                {submitting ? (
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                ) : (
                  <Icon className="size-5" aria-hidden />
                )}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-950">{option.title}</span>
                <span className="mt-1 block text-sm leading-5 text-zinc-600">
                  {option.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
