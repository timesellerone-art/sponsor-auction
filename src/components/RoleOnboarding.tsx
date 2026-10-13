'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Briefcase, Clapperboard, Loader2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { AUTH_FAIL_MESSAGE, saveMemberRole } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { isMemberRole, type MemberRole } from '@/types/auth';

type RoleOnboardingProps = {
  name: string;
  onCompleted: () => void;
};

const ROLE_OPTIONS: {
  value: MemberRole;
  title: string;
  subtitle: string;
  description: string;
  icon: typeof Briefcase;
}[] = [
  {
    value: 'advertiser',
    title: '광고주 (Brand)',
    subtitle: '캠페인을 등록합니다',
    description: '예산을 올리고 크리에이터 제안을 비교한 뒤 낙찰할 수 있습니다.',
    icon: Briefcase,
  },
  {
    value: 'creator',
    title: '크리에이터 (Creator)',
    subtitle: '제안에 참여합니다',
    description: '진행 중인 역경매를 보고 채널과 금액으로 입찰할 수 있습니다.',
    icon: Clapperboard,
  },
];

export function RoleOnboarding({ name, onCompleted }: RoleOnboardingProps) {
  const [selected, setSelected] = useState<MemberRole | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async () => {
    if (!isMemberRole(selected) || submitting) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await saveMemberRole(selected);
      if (result.error || !result.data) {
        showToast(result.error ?? AUTH_FAIL_MESSAGE);
        return;
      }

      showToast('역할이 저장되었습니다.', 'success');
      onCompleted();
    } catch {
      showToast(AUTH_FAIL_MESSAGE);
    } finally {
      setSubmitting(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-zinc-950/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="role-onboarding-title"
        className="relative flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
      >
        <div className="shrink-0 border-b border-zinc-200 px-4 py-4 sm:px-5">
          <p className="text-xs font-semibold tracking-wide text-teal-800">
            시작하기
          </p>
          <h2
            id="role-onboarding-title"
            className="mt-1 text-lg font-bold text-zinc-950"
          >
            {name}님, 역할을 선택해 주세요
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            회원가입 또는 최초 로그인 시 한 번만 선택합니다. 선택한 역할에 따라
            메뉴와 권한이 달라집니다.
          </p>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-5">
          {ROLE_OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = selected === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelected(option.value)}
                className={cn(
                  'flex w-full min-w-0 items-start gap-3 rounded-2xl border px-4 py-4 text-left',
                  active
                    ? 'border-teal-600 bg-teal-50 ring-2 ring-teal-100'
                    : 'border-zinc-200 hover:bg-zinc-50',
                )}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-800 shadow-sm">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-zinc-950">
                    {option.title}
                  </span>
                  <span className="mt-0.5 block text-xs font-medium text-teal-800">
                    {option.subtitle}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-zinc-600">
                    {option.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-zinc-200 px-4 py-3 sm:px-5">
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={() => {
              void handleSubmit();
            }}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {submitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : null}
            역할 저장하고 시작하기
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
