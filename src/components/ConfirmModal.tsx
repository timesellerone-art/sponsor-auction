'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  busyLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = '확인',
  busyLabel = '처리 중...',
  cancelLabel = '취소',
  busy = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  const titleId = useId();
  const [localBusy, setLocalBusy] = useState(false);
  const isBusy = busy || localBusy;

  const handleClose = useCallback(() => {
    if (isBusy) {
      return;
    }
    setLocalBusy(false);
    onClose();
  }, [isBusy, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isBusy) {
        handleClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [handleClose, open, isBusy]);


  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4"
      onClick={isBusy ? undefined : handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative my-auto w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl max-h-[85vh]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-base font-semibold text-zinc-950">
            {title}
          </h2>
          <button
            type="button"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            aria-label="닫기"
            disabled={isBusy}
            onClick={handleClose}
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-3 text-sm leading-6 text-zinc-600">{description}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={isBusy}
            onClick={handleClose}
            className="inline-flex h-10 items-center justify-center rounded-full border border-zinc-200 px-4 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              if (isBusy) {
                return;
              }
              setLocalBusy(true);
              onConfirm();
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {isBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {isBusy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
