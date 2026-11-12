'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Sparkles, X } from 'lucide-react';
import { AgreementFields } from '@/components/AgreementFields';
import { EscrowNotice } from '@/components/EscrowNotice';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { DEMO_CREATOR_BANK_ACCOUNT, isDemoAccountEmail } from '@/lib/auth-mock';
import { INSERT_FAIL_MESSAGE, createBid, getAuctionById } from '@/lib/auctions';
import { isUuid } from '@/lib/uuid';
import { FeeBreakdownCard } from '@/components/fee/FeeBreakdownCard';
import { rememberMyBid } from '@/lib/my-bids';
import { isCampaignAuthor } from '@/lib/my-campaigns';
import { getAuctionOwnerId, pushNotification } from '@/lib/notifications';
import { cn, formatWon } from '@/lib/utils';
import {
  MIN_PROPOSAL_LENGTH,
  VALIDATION,
  getBidBlockReason,
  validateBidForm,
  type BidFieldErrors,
} from '@/lib/validation';
import {
  campaignCategoryLabel,
  displayCampaignDescription,
  resolveCampaignCategory,
} from '@/lib/campaign-presentation';
import type { AuctionItem } from '@/types/auction';

type FieldErrors = BidFieldErrors;

type BidModalProps = {
  open: boolean;
  auction: Pick<
    AuctionItem,
    'id' | 'title' | 'budget' | 'status' | 'isBlind' | 'authorId' | 'description' | 'platform' | 'category'
  > | null;
  onClose: () => void;
  onCreated?: () => void;
};

export function BidModal({ open, auction, onClose, onCreated }: BidModalProps) {
  const titleId = useId();
  const { user } = useAuth();
  const { requireCreator } = useRequireAuth();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [creatorChannelUrl, setCreatorChannelUrl] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [proposalText, setProposalText] = useState('');
  const [creatorStyle, setCreatorStyle] = useState('');
  const [proposalBusy, setProposalBusy] = useState(false);
  const [proposalHint, setProposalHint] = useState<string | null>(null);
  const [bankAccount, setBankAccount] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const { isBusy: isSubmitting, run } = useActionLock();

  const bidValue = useMemo(() => {
    const parsed = Number(bidAmount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 0;
    }
    return parsed;
  }, [bidAmount]);

  const resetForm = () => {
    setCreatorChannelUrl('');
    setBidAmount('');
    setProposalText('');
    setCreatorStyle('');
    setProposalBusy(false);
    setProposalHint(null);
    setBankAccount('');
    setErrors({});
    setSubmitError(null);
    setAgreeTerms(false);
    setAgreePrivacy(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      firstFieldRef.current?.focus({ preventScroll: true });
    });
    const fillBank = window.setTimeout(() => {
      setBankAccount((current) =>
        current.trim()
          ? current
          : isDemoAccountEmail(user?.email)
            ? DEMO_CREATOR_BANK_ACCOUNT
            : current,
      );
    }, 0);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(fillBank);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, isSubmitting, user?.email]);

  if (!open || !auction) {
    return null;
  }

  const handleGenerateProposal = async () => {
    if (proposalBusy || isSubmitting) {
      return;
    }
    setProposalBusy(true);
    setProposalHint(null);
    try {
      const categoryId = resolveCampaignCategory({
        title: auction.title,
        description: auction.description ?? '',
        category: auction.category,
      });
      const response = await fetch('/api/ai-proposal', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignTitle: auction.title,
          campaignDescription: displayCampaignDescription(auction.description),
          category: categoryId ? campaignCategoryLabel(categoryId) : '',
          platform: auction.platform,
          creatorStyle,
        }),
      });
      const json = (await response.json().catch(() => null)) as {
        proposal?: string;
        errorMessage?: string;
        error?: string;
      } | null;
      if (response.status === 401 || response.status === 403) {
        const message =
          json?.errorMessage ?? json?.error ?? '크리에이터 로그인 후 AI 초안을 만들 수 있습니다.';
        setProposalHint(message);
        showToast(message);
        return;
      }
      const draft = json?.proposal?.trim() ?? '';
      if (!draft) {
        const message = 'AI 제안서 초안을 만들지 못했습니다. 다시 시도해 주세요.';
        setProposalHint(message);
        showToast(message);
        return;
      }
      setProposalText(draft);
      setErrors((current) => {
        const next = { ...current };
        delete next.proposalText;
        return next;
      });
      setProposalHint('초안을 채워 두었습니다. 말투에 맞게 수정한 뒤 제출하세요.');
      showToast('AI 제안서 초안을 채워 두었습니다.', 'success');
    } catch {
      const message = 'AI 제안서 초안을 만들지 못했습니다. 다시 시도해 주세요.';
      setProposalHint(message);
      showToast(message);
    } finally {
      setProposalBusy(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run('bid', async () => {
      try {
        if (!requireCreator(`/auctions/${auction.id}`) || !user) {
          const message = !user
            ? '제안은 로그인 후 크리에이터 계정으로 할 수 있습니다.'
            : '크리에이터 전용 기능입니다. 크리에이터 계정으로 로그인해 주세요.';
          setSubmitError(message);
          onClose();
          return;
        }

        const auctionId = auction.id.trim();
        const latest = await getAuctionById(auctionId);
        const currentAuction = latest.data ?? auction;
        const blocked = getBidBlockReason(currentAuction);
        if (blocked) {
          setSubmitError(blocked);
          showToast(blocked);
          return;
        }
        if (isCampaignAuthor(currentAuction, user.id)) {
          setSubmitError(VALIDATION.selfCampaignBid);
          showToast(VALIDATION.selfCampaignBid);
          return;
        }

        const settlementEmail = user.email?.trim() ?? '';
        const resolvedBank =
          bankAccount.trim() ||
          (isDemoAccountEmail(user.email) ? DEMO_CREATOR_BANK_ACCOUNT : '');
        const nextErrors = validateBidForm({
          creatorChannelUrl,
          bidAmount,
          proposalText,
          auctionBudget: currentAuction.budget,
          creatorEmail: settlementEmail,
          bankAccount: resolvedBank,
          agreeTerms,
          agreePrivacy,
        });
        setErrors(nextErrors);
        setSubmitError(null);

        if (Object.keys(nextErrors).length > 0) {
          const bypassMessage = nextErrors.proposalText || nextErrors.creatorChannelUrl;
          if (bypassMessage === VALIDATION.offPlatformContact) {
            showToast(bypassMessage);
          }
          const focusId =
            nextErrors.bidAmount
              ? 'bid-amount'
              : nextErrors.proposalText
                ? 'bid-proposal'
                : nextErrors.creatorChannelUrl
                  ? 'bid-url'
                  : nextErrors.settlementEmail
                    ? 'bid-settlement-email'
                    : nextErrors.bankAccount
                      ? 'bid-bank-account'
                      : 'bid-agreements';
          window.requestAnimationFrame(() => {
            document.getElementById(focusId)?.scrollIntoView({ block: 'nearest' });
          });
          return;
        }

        const payload = {
          auctionId,
          creatorId: user.id,
          creatorName: user.name.trim() || '크리에이터',
          creatorChannelUrl: creatorChannelUrl.trim(),
          bidAmount: Number(bidAmount),
          proposalText: proposalText.trim(),
          creatorEmail: settlementEmail,
          bankAccount: resolvedBank,
        };

        let result: Awaited<ReturnType<typeof createBid>>;
        const localOnly = isDemoAccountEmail(user.email) || !isUuid(auctionId);
        if (localOnly) {
          result = await createBid(payload);
        } else {
          try {
            const response = await fetch('/api/bids', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const json = (await response.json().catch(() => null)) as {
              data?: Awaited<ReturnType<typeof createBid>>['data'];
              error?: string;
              errorMessage?: string;
            } | null;
            if (response.ok && json?.data) {
              result = { data: json.data, error: null };
            } else {
              result = {
                data: null,
                error: json?.errorMessage ?? json?.error ?? INSERT_FAIL_MESSAGE,
              };
            }
          } catch {
            result = await createBid(payload);
          }
        }

        if (result.error || !result.data) {
          const message = result.error ?? INSERT_FAIL_MESSAGE;
          setSubmitError(message);
          showToast(message);
          return;
        }

        rememberMyBid(result.data.id);
        resetForm();
        showToast('제안을 제출했습니다.', 'success');
        const ownerId = getAuctionOwnerId(auction.id, latest.data?.authorId);
        if (ownerId && ownerId !== user.id) {
          pushNotification({
            userId: ownerId,
            type: 'bid_received',
            title: '제안서 접수',
            body: `"${auction.title || '캠페인'}"에 새 제안이 도착했습니다.`,
            href: `/auctions/${auction.id}`,
            toast: false,
          });
        }
        onCreated?.();
        window.dispatchEvent(new Event('auctions:changed'));
        onClose();
      } catch {
        setSubmitError(INSERT_FAIL_MESSAGE);
        showToast(INSERT_FAIL_MESSAGE);
      }
    });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4"
      onClick={isSubmitting ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative my-auto flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold text-zinc-950">
              콘텐츠 제안하기
            </h2>
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              {auction.title || '제목 없음'} · 예산 {formatWon(auction.budget ?? 0)}
            </p>
          </div>
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            aria-label="닫기"
            disabled={isSubmitting}
            onClick={onClose}
          >
            <X className="size-5" />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
            <Field
              label="제안 금액(단가)"
              htmlFor="bid-amount"
              error={errors.bidAmount}
              hint="원 단위"
            >
              <input
                id="bid-amount"
                ref={firstFieldRef}
                type="text"
                inputMode="numeric"
                value={bidAmount}
                onChange={(event) => setBidAmount(event.target.value)}
                className={inputClass(Boolean(errors.bidAmount))}
                placeholder="예: 300000"
                aria-label="제안 금액(단가)"
                autoComplete="off"
              />
            </Field>

            {bidValue > 0 ? (
              <FeeBreakdownCard role="creator" amount={bidValue} />
            ) : (
              <div className="rounded-xl border border-clink-peach-strong bg-clink-peach px-3 py-3 text-sm text-clink">
                <p className="text-xs text-clink-accent">
                  제안 금액을 입력하면 통합 수수료(20%) 공제 후 최종 입금액이 실시간으로
                  계산됩니다.
                </p>
              </div>
            )}

            <div className="rounded-2xl bg-[#1C1917] p-4 text-white shadow-[0_8px_30px_rgb(28,25,23,0.18)]">
              <p className="text-[11px] font-semibold tracking-wide text-[#EA580C]">
                AI 제안서 초안 생성기
              </p>
              <p className="mt-1 text-xs leading-5 text-white/65">
                채널 스타일을 적으면 캠페인에 맞춘 제안서 초안을 채워 줍니다. 제출 전에 자유롭게
                수정하세요.
              </p>
              <label className="mt-3 block">
                <span className="sr-only">내 채널 스타일</span>
                <input
                  id="bid-creator-style"
                  type="text"
                  value={creatorStyle}
                  onChange={(event) => setCreatorStyle(event.target.value)}
                  className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#EA580C] focus:ring-2 focus:ring-[#EA580C]/30"
                  placeholder="예: 20대 직장인 일상 브이로그, 솔직 리뷰 위주"
                  autoComplete="off"
                />
              </label>
              <button
                type="button"
                onClick={() => void handleGenerateProposal()}
                disabled={proposalBusy || isSubmitting}
                className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#EA580C] px-3 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {proposalBusy ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    AI가 제안서를 작성 중...
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" aria-hidden />
                    AI로 맞춤 제안서 초안 쓰기
                  </>
                )}
              </button>
              {proposalHint ? (
                <p className="mt-2 text-xs leading-5 text-white/70">{proposalHint}</p>
              ) : null}
            </div>

            <Field
              label="제안 내용/소개글"
              htmlFor="bid-proposal"
              error={errors.proposalText}
              hint={`최소 ${MIN_PROPOSAL_LENGTH}자`}
            >
              <textarea
                id="bid-proposal"
                rows={5}
                value={proposalText}
                onChange={(event) => setProposalText(event.target.value)}
                className={cn(
                  inputClass(Boolean(errors.proposalText)),
                  'h-auto min-h-28 resize-y py-2',
                )}
                placeholder="콘텐츠 콘셉트, 제작 방식, 예상 성과를 구체적으로 적어 주세요."
              />
            </Field>

            <Field
              label="채널 URL 또는 포트폴리오 링크"
              htmlFor="bid-url"
              error={errors.creatorChannelUrl}
            >
              <input
                id="bid-url"
                type="url"
                value={creatorChannelUrl}
                onChange={(event) => setCreatorChannelUrl(event.target.value)}
                className={inputClass(Boolean(errors.creatorChannelUrl))}
                placeholder="https://www.youtube.com/@channel"
              />
            </Field>

            <Field
              label="정산 이메일"
              htmlFor="bid-settlement-email"
              error={errors.settlementEmail}
            >
              <input
                id="bid-settlement-email"
                type="email"
                value={user?.email ?? ''}
                readOnly
                title={user?.email || '이메일 없음'}
                className={inputClass(Boolean(errors.settlementEmail))}
                placeholder="계정 이메일이 정산 연락처로 사용됩니다"
              />
            </Field>

            <Field
              label="정산 계좌"
              htmlFor="bid-bank-account"
              error={errors.bankAccount}
              hint="은행명 + 계좌번호"
            >
              <input
                id="bid-bank-account"
                type="text"
                value={bankAccount}
                onChange={(event) => setBankAccount(event.target.value)}
                className={inputClass(Boolean(errors.bankAccount))}
                placeholder="예: 신한은행 110-123-456789"
                autoComplete="off"
              />
            </Field>

            <EscrowNotice compact />

            <AgreementFields
              agreeTerms={agreeTerms}
              agreePrivacy={agreePrivacy}
              onTermsChange={setAgreeTerms}
              onPrivacyChange={setAgreePrivacy}
              termsError={errors.agreeTerms}
              privacyError={errors.agreePrivacy}
            />

            {submitError ? (
              <p className="text-sm text-rose-600" role="alert">
                {submitError}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-zinc-200 bg-white px-4 py-3 sm:px-5">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  제출 중...
                </>
              ) : (
                '제안 제출'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-zinc-800">
          {label}
        </label>
        {hint ? <span className="text-xs text-zinc-400">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function inputClass(invalid: boolean) {
  return cn(
    'h-11 w-full rounded-xl border bg-white px-3 text-sm text-zinc-950 outline-none focus:ring-2',
    invalid
      ? 'border-rose-300 focus:ring-rose-200'
      : 'border-zinc-200 focus:border-clink-accent focus:ring-clink-peach-strong',
  );
}
