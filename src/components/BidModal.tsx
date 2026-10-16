'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { AgreementFields } from '@/components/AgreementFields';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { INSERT_FAIL_MESSAGE, createBid, getAuctionById } from '@/lib/auctions';
import { advertiserPayableAmount, creatorPayoutAmount } from '@/lib/fees';
import { rememberMyBid } from '@/lib/my-bids';
import { getAuctionOwnerId, pushNotification } from '@/lib/notifications';
import { cn, formatWon } from '@/lib/utils';
import {
  MIN_PROPOSAL_LENGTH,
  getBidBlockReason,
  validateBidForm,
  type BidFieldErrors,
} from '@/lib/validation';
import type { AuctionItem } from '@/types/auction';

type FieldErrors = BidFieldErrors;

type BidModalProps = {
  open: boolean;
  auction: Pick<AuctionItem, 'id' | 'title' | 'budget' | 'status' | 'isBlind'> | null;
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
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);
  const { isBusy: isSubmitting, run } = useActionLock();

  const fees = useMemo(() => {
    const bidValue = Number(bidAmount);
    if (!Number.isFinite(bidValue) || bidValue <= 0) {
      return null;
    }

    return {
      advertiserPays: advertiserPayableAmount(bidValue),
      creatorPayout: creatorPayoutAmount(bidValue),
    };
  }, [bidAmount]);

  const resetForm = () => {
    setCreatorChannelUrl('');
    setBidAmount('');
    setProposalText('');
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose, isSubmitting]);

  if (!open || !auction) {
    return null;
  }

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

        const latest = await getAuctionById(auction.id);
        const blocked = getBidBlockReason(latest.data ?? auction);
        if (blocked) {
          setSubmitError(blocked);
          showToast(blocked);
          return;
        }

        const nextErrors = validateBidForm({
          creatorChannelUrl,
          bidAmount,
          proposalText,
          auctionBudget: latest.data?.budget ?? auction.budget,
          agreeTerms,
          agreePrivacy,
        });
        setErrors(nextErrors);
        setSubmitError(null);

        if (Object.keys(nextErrors).length > 0) {
          const focusId =
            nextErrors.bidAmount
              ? 'bid-amount'
              : nextErrors.proposalText
                ? 'bid-proposal'
                : nextErrors.creatorChannelUrl
                  ? 'bid-url'
                  : 'bid-agreements';
          window.requestAnimationFrame(() => {
            document.getElementById(focusId)?.scrollIntoView({ block: 'nearest' });
          });
          return;
        }

        const result = await createBid({
          auctionId: auction.id,
          creatorId: user.id,
          creatorName: user.name.trim() || '크리에이터',
          creatorChannelUrl: creatorChannelUrl.trim(),
          bidAmount: Number(bidAmount),
          proposalText: proposalText.trim(),
        });

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
              제안하기
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

            <div className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-3 text-sm text-teal-950">
              {fees ? (
                <ul className="space-y-1.5">
                  <li>
                    광고주 최종 결제액{' '}
                    <strong>{formatWon(fees.advertiserPays)}</strong>
                    <span className="block text-xs text-teal-800">
                      제안 금액 + (제안 금액 × 10% 안전결제 수수료)
                    </span>
                  </li>
                  <li>
                    크리에이터 최종 정산액{' '}
                    <strong>{formatWon(fees.creatorPayout)}</strong>
                    <span className="block text-xs text-teal-800">
                      제안 금액 − (제안 금액 × 15% 플랫폼 수수료)
                    </span>
                  </li>
                </ul>
              ) : (
                <p className="text-xs text-teal-800">
                  제안 금액을 입력하면 광고주 결제액과 크리에이터 정산액이 실시간으로
                  계산됩니다.
                </p>
              )}
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
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
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
      : 'border-zinc-200 focus:border-teal-600 focus:ring-teal-100',
  );
}
