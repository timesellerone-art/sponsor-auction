'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { SELECTABLE_PLATFORMS } from '@/lib/platforms';
import { createTimeSlot } from '@/lib/timeslots';
import { cn } from '@/lib/utils';
import { validateTimeSlotForm, type TimeSlotFieldErrors } from '@/lib/validation';
import type { PlatformType } from '@/types/auction';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function localDateTime(daysFromNow: number, hour: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 5);
  return date.toISOString().slice(0, 10);
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
  const [expectedViews, setExpectedViews] = useState('100000');
  const [startingPrice, setStartingPrice] = useState('300000');
  const [description, setDescription] = useState('');
  const [slotStart, setSlotStart] = useState(() => localDateTime(3, 14));
  const [slotEnd, setSlotEnd] = useState(() => localDateTime(3, 16));
  const [deadline, setDeadline] = useState(() => defaultDeadline());
  const [errors, setErrors] = useState<TimeSlotFieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { isBusy: isSubmitting, run } = useActionLock();

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
      if (!requireCreator('/inventory') || !user) {
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

      const payload = {
        creatorId: user.id,
        creatorName: user.name,
        title: title.trim(),
        platform,
        description: description.trim(),
        expectedViews: Number(expectedViews),
        startingPrice: Number(startingPrice),
        slotStart: toIso(slotStart),
        slotEnd: toIso(slotEnd),
        deadline: new Date(`${deadline}T23:59:59+09:00`).toISOString(),
      };

      let result: { error: string | null };
      try {
        const response = await fetch('/api/timeslots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = (await response.json().catch(() => null)) as {
          data?: unknown;
          error?: string;
          errorMessage?: string;
        } | null;
        if (response.ok && json?.data) {
          result = { error: null };
        } else {
          result = { error: json?.errorMessage ?? json?.error ?? '타임슬롯을 등록하지 못했습니다.' };
        }
      } catch {
        result = await createTimeSlot(payload);
      }

      if (result.error) {
        setSubmitError(result.error);
        showToast(result.error);
        return;
      }
      showToast('타임슬롯을 등록했습니다.', 'success');
      window.dispatchEvent(new Event('timeslots:changed'));
      onClose();
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-zinc-950/40 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="닫기" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <h2 id={titleId} className="text-base font-bold text-zinc-950">
            타임슬롯 등록
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-zinc-100">
            <X className="size-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col" aria-labelledby={titleId}>
          <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-4 py-4">
            <Field label="슬롯 제목" htmlFor="slot-title" error={errors.title}>
              <input
                ref={firstFieldRef}
                id="slot-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className={inputClass(Boolean(errors.title))}
                placeholder="예: 주말 숏폼 1편 슬롯"
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
            <Field label="예상 조회수" htmlFor="slot-views" error={errors.expectedViews} hint="최소 1,000회">
              <input
                id="slot-views"
                inputMode="numeric"
                value={expectedViews}
                onChange={(event) => setExpectedViews(event.target.value)}
                className={inputClass(Boolean(errors.expectedViews))}
              />
            </Field>
            <Field label="시작가" htmlFor="slot-price" error={errors.startingPrice} hint="최소 10,000원">
              <input
                id="slot-price"
                inputMode="numeric"
                value={startingPrice}
                onChange={(event) => setStartingPrice(event.target.value)}
                className={inputClass(Boolean(errors.startingPrice))}
              />
            </Field>
            <Field label="슬롯 시작" htmlFor="slot-start" error={errors.slotStart}>
              <input
                id="slot-start"
                type="datetime-local"
                value={slotStart}
                onChange={(event) => setSlotStart(event.target.value)}
                className={inputClass(Boolean(errors.slotStart))}
              />
            </Field>
            <Field label="슬롯 종료" htmlFor="slot-end" error={errors.slotEnd}>
              <input
                id="slot-end"
                type="datetime-local"
                value={slotEnd}
                onChange={(event) => setSlotEnd(event.target.value)}
                className={inputClass(Boolean(errors.slotEnd))}
              />
            </Field>
            <Field label="입찰 마감일" htmlFor="slot-deadline" error={errors.deadline}>
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
            {submitError ? (
              <p className="text-sm text-rose-600" role="alert">
                {submitError}
              </p>
            ) : null}
          </div>
          <div className="border-t border-zinc-200 px-4 py-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
              {isSubmitting ? '등록 중...' : '타임슬롯 등록'}
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
