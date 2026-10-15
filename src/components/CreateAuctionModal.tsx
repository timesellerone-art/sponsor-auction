'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { INSERT_FAIL_MESSAGE, createAuction } from '@/lib/auctions';
import { rememberMyAuction } from '@/lib/my-campaigns';
import { rememberAuctionOwner } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { validateAuctionForm, type AuctionFieldErrors } from '@/lib/validation';
import { SELECTABLE_PLATFORMS } from '@/lib/platforms';
import type { PlatformType } from '@/types/auction';

type FieldErrors = AuctionFieldErrors;

type CreateAuctionModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
};

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

export function CreateAuctionModal({
  open,
  onClose,
  onCreated,
}: CreateAuctionModalProps) {
  const titleId = useId();
  const { user } = useAuth();
  const { requireAdvertiser } = useRequireAuth();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('youtube_shorts');
  const [budget, setBudget] = useState('');
  const [description, setDescription] = useState('');
  const [deadline, setDeadline] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { isBusy: isSubmitting, run } = useActionLock();

  useEffect(() => {
    if (!open) {
      return;
    }

    setDeadline((current) => current || defaultDeadline());

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

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run('create-auction', async () => {
      if (!requireAdvertiser('advertiser-auth', '/')) {
        onClose();
        return;
      }

      const nextErrors = validateAuctionForm({
        title,
        budget,
        description,
        deadline,
      });
      setErrors(nextErrors);
      setSubmitError(null);

      if (Object.keys(nextErrors).length > 0) {
        return;
      }

      try {
        const result = await createAuction({
          title: title.trim(),
          platform,
          budget: Number(budget),
          description: description.trim(),
          deadline: new Date(`${deadline}T23:59:59+09:00`).toISOString(),
          authorId: user?.id ?? null,
          authorName: user?.name?.trim() || '',
        });

        if (result.error || !result.data) {
          const message = result.error ?? INSERT_FAIL_MESSAGE;
          setSubmitError(message);
          showToast(INSERT_FAIL_MESSAGE);
          return;
        }

        setTitle('');
        setPlatform('youtube_shorts');
        setBudget('');
        setDescription('');
        setDeadline(defaultDeadline());
        setErrors({});
        rememberMyAuction(result.data.id);
        rememberAuctionOwner(result.data.id, user?.id);
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
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-hidden bg-zinc-950/50 p-4"
      onClick={isSubmitting ? undefined : onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(90dvh,calc(100dvh-2rem))] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 sm:px-5">
          <h2 id={titleId} className="text-base font-semibold text-zinc-950">
            역경매 요청하기
          </h2>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
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
              label="제목"
              htmlFor="auction-title"
              error={errors.title}
              hint="최소 5자"
            >
              <input
                id="auction-title"
                ref={firstFieldRef}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClass(Boolean(errors.title))}
                placeholder="예: 여름 신제품 숏폼 캠페인"
                autoComplete="off"
              />
            </Field>

            <Field label="플랫폼" htmlFor="auction-platform">
              <select
                id="auction-platform"
                value={platform}
                onChange={(event) =>
                  setPlatform(event.target.value as PlatformType)
                }
                className={inputClass(false)}
              >
                {SELECTABLE_PLATFORMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="예산"
              htmlFor="auction-budget"
              error={errors.budget}
              hint="최소 10,000원"
            >
              <input
                id="auction-budget"
                type="text"
                inputMode="numeric"
                value={budget}
                onChange={(event) => setBudget(event.target.value)}
                className={inputClass(Boolean(errors.budget))}
                placeholder="10000"
                aria-label="예산"
                autoComplete="off"
              />
            </Field>

            <Field
              label="상세설명"
              htmlFor="auction-description"
              error={errors.description}
              hint="최소 10자"
            >
              <textarea
                id="auction-description"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={cn(
                  inputClass(Boolean(errors.description)),
                  'h-auto min-h-24 resize-y py-2',
                )}
                placeholder="캠페인 목적, 필수 컷, 납품 형식 등을 적어 주세요."
              />
            </Field>

            <Field label="마감일" htmlFor="auction-deadline" error={errors.deadline}>
              <input
                id="auction-deadline"
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className={inputClass(Boolean(errors.deadline))}
              />
            </Field>

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
                  등록 중...
                </>
              ) : (
                '역경매 등록'
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
