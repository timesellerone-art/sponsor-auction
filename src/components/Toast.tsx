'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const TOAST_EVENT = 'app:toast';
const TOAST_DURATION_MS = 4500;

type ToastVariant = 'error' | 'success' | 'info';

type ToastDetail = {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

export function showToast(
  message: string,
  variant: ToastVariant = 'error',
  durationMs = TOAST_DURATION_MS,
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ToastDetail>(TOAST_EVENT, {
      detail: { message, variant, durationMs },
    }),
  );
}

export function ToastHost() {
  const [message, setMessage] = useState<string | null>(null);
  const [variant, setVariant] = useState<ToastVariant>('error');

  useEffect(() => {
    let hideTimer: number | undefined;

    const onToast = (event: Event) => {
      const custom = event as CustomEvent<ToastDetail>;
      const nextMessage = custom.detail?.message?.trim();
      if (!nextMessage) {
        return;
      }

      setMessage(nextMessage);
      setVariant(
        custom.detail?.variant === 'success'
          ? 'success'
          : custom.detail?.variant === 'info'
            ? 'info'
            : 'error',
      );
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        setMessage(null);
      }, custom.detail?.durationMs ?? TOAST_DURATION_MS);
    };

    window.addEventListener(TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(TOAST_EVENT, onToast);
      window.clearTimeout(hideTimer);
    };
  }, []);

  if (!message) {
    return null;
  }

  return (
    <div
      role="alert"
      className={
        variant === 'success'
          ? 'fixed right-4 bottom-4 z-[90] w-[min(100%-2rem,26rem)] rounded-xl border border-teal-200 bg-white px-4 py-3 shadow-lg'
          : variant === 'info'
            ? 'fixed right-4 bottom-4 z-[90] w-[min(100%-2rem,26rem)] rounded-xl border border-amber-200 bg-white px-4 py-3 shadow-lg'
            : 'fixed right-4 bottom-4 z-[90] w-[min(100%-2rem,26rem)] rounded-xl border border-rose-200 bg-white px-4 py-3 shadow-lg'
      }
    >
      <div className="flex items-start gap-3">
        <p className="flex-1 whitespace-pre-wrap text-sm leading-5 text-zinc-800">{message}</p>
        <button
          type="button"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100"
          aria-label="알림 닫기"
          onClick={() => setMessage(null)}
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
