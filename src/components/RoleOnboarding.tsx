'use client';

import { useState } from 'react';
import { Briefcase, Clapperboard, Loader2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { AUTH_FAIL_MESSAGE, saveMemberRole } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { isMemberRole, type MemberRole } from '@/types/auth';

type RoleOnboardingProps = {
  name: string;
  onCompleted: (role: MemberRole) => void;
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
    description: '브랜드/기업 캠페인을 집행하는 사용자입니다. 예산을 올리고 크리에이터 제안을 비교한 뒤 낙찰할 수 있습니다.',
    icon: Briefcase,
  },
  {
    value: 'creator',
    title: '크리에이터로 시작하기',
    description: '유튜브 채널 광고 타임슬롯을 판매하는 사용자입니다. 진행 중인 역경매에 채널과 금액으로 입찰할 수 있습니다.',
    icon: Clapperboard,
  },
];

export function RoleOnboarding({ name, onCompleted }: RoleOnboardingProps) {
  const [busy, setBusy] = useState<MemberRole | null>(null);

  const handleChoose = async (role: MemberRole) => {
    if (!isMemberRole(role) || busy) {
      return;
    }

    setBusy(role);
    try {
      const result = await saveMemberRole(role);
      if (result.error || !result.data) {
        showToast(result.error ?? AUTH_FAIL_MESSAGE);
        return;
      }
      showToast(
        role === 'advertiser' ? '광고주로 시작합니다.' : '크리에이터로 시작합니다.',
        'success',
      );
      onCompleted(role);
    } catch {
      showToast(AUTH_FAIL_MESSAGE);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="text-sm font-semibold tracking-wide text-teal-800">시작하기</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-950">
        {name}님, 역할을 선택해 주세요
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        회원가입 또는 소셜 로그인 후 한 번만 선택합니다. 선택한 역할에 따라 메뉴와
        권한이 달라집니다.
      </p>

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
                <span className="block text-sm font-semibold text-zinc-950">
                  {option.title}
                </span>
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
