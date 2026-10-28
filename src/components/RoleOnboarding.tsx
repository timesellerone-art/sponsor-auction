'use client';

import { useState } from 'react';
import { Briefcase, Clapperboard, Link2, Loader2 } from 'lucide-react';
import { showToast } from '@/components/Toast';
import {
  AUTH_FAIL_MESSAGE,
  saveMemberRole,
  sendAccountProofEmail,
  signInWithOAuth,
  type SocialOAuthProvider,
} from '@/lib/auth';
import { ROLE_SELECT_PATH } from '@/lib/auth-guard';
import { isPlaceholderOAuthEmail, isValidContactEmail, isValidPhone } from '@/lib/contact';
import { cn } from '@/lib/utils';
import {
  isMemberRole,
  type AccountMergeChallenge,
  type MemberRole,
  type ProofProvider,
} from '@/types/auth';

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

const PROOF_LABELS: Record<ProofProvider, string> = {
  google: 'Google 계정으로 본인 확인',
  kakao: '카카오 계정으로 본인 확인',
  naver: '네이버 계정으로 본인 확인',
  email: '이메일 로그인 링크로 본인 확인',
};

export function RoleOnboarding({ name, email, onCompleted }: RoleOnboardingProps) {
  const providerEmail = isPlaceholderOAuthEmail(email) ? '' : (email?.trim() ?? '');
  const [contactEmail, setContactEmail] = useState(providerEmail);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState<MemberRole | ProofProvider | null>(null);
  const [challenge, setChallenge] = useState<AccountMergeChallenge | null>(null);

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
      if (result.data.kind === 'merge-required') {
        setChallenge(result.data.challenge);
        return;
      }
      showToast(
        role === 'advertiser' ? '광고주로 시작합니다.' : '크리에이터로 시작합니다.',
        'success',
      );
      const savedRoles = (result.data.user.roles ?? []).filter(isMemberRole);
      onCompleted(savedRoles.length > 0 ? savedRoles : [role]);
    } catch {
      showToast(AUTH_FAIL_MESSAGE);
    } finally {
      setBusy(null);
    }
  };

  const handleProof = async (provider: ProofProvider) => {
    if (busy) {
      return;
    }
    setBusy(provider);
    try {
      if (provider === 'email') {
        const sent = await sendAccountProofEmail(contactEmail);
        showToast(
          sent.error ?? '메일함의 로그인 링크를 이 브라우저에서 열면 계정이 합쳐집니다.',
          sent.error ? undefined : 'success',
        );
        return;
      }
      const started = await signInWithOAuth(provider as SocialOAuthProvider, ROLE_SELECT_PATH);
      if (started.error) {
        showToast(started.error);
      }
    } finally {
      setBusy(null);
    }
  };

  if (challenge) {
    return (
      <div className="mx-auto w-full max-w-lg">
        <p className="text-sm font-semibold tracking-wide text-teal-800">계정 통합</p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-950">이미 가입된 계정이 있습니다</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {challenge.maskedEmail ? `${challenge.maskedEmail} 계정과 ` : '기존 계정과 '}
          대표 이메일 또는 전화번호가 일치합니다. 기존 계정으로 로그인해 본인임을 확인하면 지금
          로그인한 소셜 계정이 기존 계정에 합쳐지고, 기존 역할과 모드가 그대로 유지됩니다.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          {challenge.providers.map((provider) => (
            <button
              key={provider}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => {
                void handleProof(provider);
              }}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy === provider ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Link2 className="size-4" aria-hidden />
              )}
              {PROOF_LABELS[provider]}
            </button>
          ))}
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => setChallenge(null)}
            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-zinc-200 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
          >
            다른 이메일 입력
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-lg">
      <p className="text-sm font-semibold tracking-wide text-teal-800">시작하기</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-950">
        {name}님, 역할을 선택해 주세요
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        대표 이메일과 전화번호로 계정을 하나로 관리합니다. 구글·네이버·카카오 중 이미 가입한 계정이
        있으면 같은 이메일을 입력해 하나로 합칠 수 있습니다.
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
