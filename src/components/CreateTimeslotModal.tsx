'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { BusinessStatusNotice } from '@/components/BusinessStatusNotice';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { authRequestInit } from '@/lib/auth-request';
import { TIMESLOT_BUSINESS_REQUIRED_NOTICE } from '@/lib/business-registration';
import { uploadCampaignCover, validateCampaignCoverFile } from '@/lib/campaign-image';
import {
  SELECTABLE_CAMPAIGN_CATEGORIES,
  type CampaignCategoryId,
} from '@/lib/campaign-presentation';
import { SELECTABLE_PLATFORMS } from '@/lib/platforms';
import { cn } from '@/lib/utils';
import { validateTimeSlotForm, type TimeSlotFieldErrors } from '@/lib/validation';
import type { PlatformType } from '@/types/auction';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function calendarDate(now: Date, daysFromToday: number, hour = 0, minute = 0) {
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + daysFromToday,
    hour,
    minute,
    0,
    0,
  );
}

function toDateInputValue(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDateTimeLocalValue(date: Date) {
  return `${toDateInputValue(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultTimeslotSchedule(now = new Date()) {
  const deadline = calendarDate(now, 3);
  const slotStart = calendarDate(now, 4, 14, 0);
  const slotEnd = calendarDate(now, 4, 16, 0);
  return {
    deadline: toDateInputValue(deadline),
    slotStart: toDateTimeLocalValue(slotStart),
    slotEnd: toDateTimeLocalValue(slotEnd),
  };
}

function toIso(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function CreateTimeslotModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const { user } = useAuth();
  const { requireCreator } = useRequireAuth();
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState<PlatformType>('youtube_shorts');
  const [category, setCategory] = useState<CampaignCategoryId>('beauty');
  const [expectedViews, setExpectedViews] = useState('100000');
  const [startingPrice, setStartingPrice] = useState('300000');
  const [description, setDescription] = useState('');
  const [slotStart, setSlotStart] = useState('');
  const [slotEnd, setSlotEnd] = useState('');
  const [deadline, setDeadline] = useState('');
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<TimeSlotFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [businessBlocked, setBusinessBlocked] = useState(true);
  const { isBusy: isSubmitting, run } = useActionLock();

  useEffect(() => {
    if (open) {
      setBusinessBlocked(true);
      setSubmitError(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setTitle('');
    setPlatform('youtube_shorts');
    setCategory('beauty');
    setExpectedViews('100000');
    setStartingPrice('300000');
    setDescription('');
    const schedule = defaultTimeslotSchedule();
    setSlotStart(schedule.slotStart);
    setSlotEnd(schedule.slotEnd);
    setDeadline(schedule.deadline);
    setCoverFile(null);
    setCoverPreview((current) => {
      if (current?.startsWith('blob:')) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setErrors({});
    setSubmitError(null);
  }, [open]);

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

  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run('timeslot', async () => {
      if (!requireCreator() || !user) {
        return;
      }
      if (businessBlocked) {
        setSubmitError(TIMESLOT_BUSINESS_REQUIRED_NOTICE);
        return;
      }
      const nextErrors = validateTimeSlotForm({
        title,
        description,
        expectedViews,
        startingPrice,
        slotStart,
        slotEnd,
        deadline,
      });
      setErrors(nextErrors);
      setSubmitError(null);
      if (Object.keys(nextErrors).length > 0) {
        return;
      }

      let imageUrl: string | null = null;
      if (coverFile) {
        const uploaded = await uploadCampaignCover(coverFile, user.id);
        if (uploaded.url) {
          imageUrl = uploaded.url;
        } else if (uploaded.error) {
          showToast(uploaded.error);
        }
      }

      const payload = {
        creatorId: user.id,
        creatorName: user.name,
        title: title.trim(),
        platform,
        category,
        description: description.trim(),
        expectedViews: Number(expectedViews),
        startingPrice: Number(startingPrice),
        slotStart: toIso(slotStart),
        slotEnd: toIso(slotEnd),
        deadline: new Date(`${deadline}T23:59:59+09:00`).toISOString(),
        imageUrl,
      };

      let result: { error: string | null };
      try {
        const response = await fetch(
          '/api/timeslots',
          await authRequestInit({
            method: 'POST',
            body: JSON.stringify(payload),
          }),
        );
        const json = (await response.json().catch(() => null)) as {
          data?: unknown;
          error?: string;
          errorMessage?: string;
        } | null;
        if (response.ok && json?.data) {
          result = { error: null };
        } else {
          result = { error: json?.errorMessage ?? json?.error ?? '크리에이터 상품을 등록하지 못했습니다.' };
        }
      } catch {
        const { createTimeSlot } = await import('@/lib/timeslots');
        result = await createTimeSlot(payload);
      }

      if (result.error) {
        setSubmitError(result.error);
        showToast(result.error);
        return;
      }
      showToast('크리에이터 상품을 등록했습니다.', 'success');
      window.dispatchEvent(new Event('timeslots:changed'));
      onClose();
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-zinc-950/40 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="닫기" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 id={titleId} className="text-base font-bold text-zinc-950">
            크리에이터 상품 등록
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-zinc-100">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" aria-labelledby={titleId}>
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-4 py-4">
            <BusinessStatusNotice
              intent="timeslot"
              onChange={setBusinessBlocked}
              onVerifyNavigate={onClose}
            />
            <fieldset
              disabled={businessBlocked}
              className={cn('flex flex-col gap-3', businessBlocked && 'pointer-events-none opacity-60')}
            >
            <Field label="상품 제목" htmlFor="slot-title" error={errors.title}>
              <input
                ref={firstFieldRef}
                id="slot-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClass(Boolean(errors.title))}
                placeholder="예: 주말 숏폼 1편 광고 상품"
              />
            </Field>
            <Field label="플랫폼" htmlFor="slot-platform">
              <select
                id="slot-platform"
                value={platform}
                onChange={(event) => setPlatform(event.target.value as PlatformType)}
                className={inputClass(false)}
              >
                {SELECTABLE_PLATFORMS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="콘텐츠 분야" htmlFor="slot-category">
              <select
                id="slot-category"
                value={category}
                onChange={(event) => setCategory(event.target.value as CampaignCategoryId)}
                className={inputClass(false)}
              >
                {SELECTABLE_CAMPAIGN_CATEGORIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="예상 조회수" htmlFor="slot-views" error={errors.expectedViews} hint="최소 1,000회">
              <input
                id="slot-views"
                inputMode="numeric"
                value={expectedViews}
                onChange={(event) => setExpectedViews(event.target.value)}
                className={inputClass(Boolean(errors.expectedViews))}
              />
            </Field>
            <Field label="캠페인 단가" htmlFor="slot-price" error={errors.startingPrice} hint="최소 10,000원">
              <input
                id="slot-price"
                inputMode="numeric"
                value={startingPrice}
                onChange={(event) => setStartingPrice(event.target.value)}
                className={inputClass(Boolean(errors.startingPrice))}
              />
            </Field>
            <Field label="진행 시작" htmlFor="slot-start" error={errors.slotStart}>
              <input
                id="slot-start"
                type="datetime-local"
                value={slotStart}
                onChange={(event) => setSlotStart(event.target.value)}
                className={inputClass(Boolean(errors.slotStart))}
              />
            </Field>
            <Field label="진행 종료" htmlFor="slot-end" error={errors.slotEnd}>
              <input
                id="slot-end"
                type="datetime-local"
                value={slotEnd}
                onChange={(event) => setSlotEnd(event.target.value)}
                className={inputClass(Boolean(errors.slotEnd))}
              />
            </Field>
            <Field label="모집 마감일" htmlFor="slot-deadline" error={errors.deadline}>
              <input
                id="slot-deadline"
                type="date"
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className={inputClass(Boolean(errors.deadline))}
              />
            </Field>
            <Field label="설명" htmlFor="slot-description" error={errors.description}>
              <textarea
                id="slot-description"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className={cn(inputClass(Boolean(errors.description)), 'h-auto min-h-24 resize-y py-2')}
              />
            </Field>
            <Field
              label="상품 대표 사진 업로드(선택)"
              htmlFor="slot-cover"
              hint="JPG, PNG, WEBP · 5MB 이하"
            >
              <div className="flex min-w-0 items-center gap-3">
                <input
                  id="slot-cover"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (!file) {
                      setCoverFile(null);
                      setCoverPreview((current) => {
                        if (current?.startsWith('blob:')) {
                          URL.revokeObjectURL(current);
                        }
                        return null;
                      });
                      return;
                    }
                    const invalid = validateCampaignCoverFile(file);
                    if (invalid) {
                      setSubmitError(invalid);
                      showToast(invalid);
                      event.target.value = '';
                      return;
                    }
                    setSubmitError(null);
                    setCoverFile(file);
                    setCoverPreview((current) => {
                      if (current?.startsWith('blob:')) {
                        URL.revokeObjectURL(current);
                      }
                      return URL.createObjectURL(file);
                    });
                  }}
                />
                <label
                  htmlFor="slot-cover"
                  className="inline-flex h-9 shrink-0 cursor-pointer items-center rounded-full bg-[#FFF7ED] px-3 text-xs font-semibold text-[#1C1917] hover:bg-[#FFEDD5]"
                >
                  파일 선택
                </label>
                {coverFile?.name ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-500">{coverFile.name}</span>
                ) : null}
              </div>
              {coverPreview ? (
                <img
                  src={coverPreview}
                  alt="대표 사진 미리보기"
                  className="mt-3 h-32 w-full rounded-xl object-cover ring-1 ring-stone-900/10"
                />
              ) : null}
            </Field>
            {submitError ? (
              <p className="text-sm text-rose-600" role="alert">
                {submitError}
              </p>
            ) : null}
            </fieldset>
          </div>
          <div className="border-t border-zinc-200 px-4 py-3">
            <button
              type="submit"
              disabled={isSubmitting || businessBlocked}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isSubmitting ? '등록 중...' : '크리에이터 상품 등록'}
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
