'use client';

import { useState } from 'react';
import { Briefcase, Clapperboard, Loader2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { AUTH_FAIL_MESSAGE, saveMemberRole } from '@/lib/auth';
import { isPlaceholderOAuthEmail, isValidContactEmail, isValidPhone } from '@/lib/contact';
import { cn } from '@/lib/utils';
import { isMemberRole, type MemberRole } from '@/types/auth';

type RoleOnboardingProps = {
  name: string;
  email?: string | null;
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
      '브랜드/기업 캠페인을 집행하는 사용자입니다. 예산을 올리고 크리에이터 제안을 비교한 뒤 낙찰할 수 있습니다.',
    icon: Briefcase,
  },
  {
    value: 'creator',
    title: '크리에이터로 시작하기',
    description:
      '유튜브 채널 광고 타임슬롯을 판매하는 사용자입니다. 진행 중인 역경매에 채널과 금액으로 입찰할 수 있습니다.',
    icon: Clapperboard,
  },
];

export function RoleOnboarding({ name, email, onCompleted }: RoleOnboardingProps) {
  const providerEmail = isPlaceholderOAuthEmail(email) ? '' : (email?.trim() ?? '');
  const [contactEmail, setContactEmail] = useState(providerEmail);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<MemberRole | null>(null);

  const handleChoose = async (role: MemberRole) => {
    if (!isMemberRole(role) || busy) {
      return;
    }
    if (!isValidContactEmail(contactEmail)) {
      showToast('대표 이메일을 입력해 주세요.');
      return;
    }
    if (phone.trim() && !isValidPhone(phone)) {
      showToast('전화번호 형식을 확인해 주세요.');
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
      showToast(
        role === 'advertiser' ? '광고주로 시작합니다.' : '크리에이터로 시작합니다.',
        'success',
      );
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
      <p className="text-sm font-semibold tracking-wide text-teal-800">시작하기</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-950">{name}님, 역할을 선택해 주세요</h1>
      <p className="mt-2 text-sm text-zinc-500">
        대표 이메일이나 전화번호가 기존 계정과 같으면 추가 로그인 없이 바로 하나로 합쳐집니다.
      </p>

      <div className="mt-5 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-800">대표 이메일</span>
          <input
            type="email"
            autoComplete="email"
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            placeholder="name@example.com"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-zinc-800">
            전화번호 <span className="font-normal text-zinc-400">(선택)</span>
          </span>
          <input
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm text-zinc-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            placeholder="01012345678"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        {ROLE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const submitting = busy === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                void handleChoose(option.value);
              }}
              className={cn(
                'flex w-full min-w-0 items-start gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-4 text-left hover:border-teal-600 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60',
              )}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
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
