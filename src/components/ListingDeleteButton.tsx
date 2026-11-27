'use client';

import { useState } from 'react';
import { ConfirmModal } from '@/components/ConfirmModal';
import { showToast } from '@/components/Toast';
import { authRequestInit } from '@/lib/auth-request';
import { LISTING_DELETE_CONFIRM, LISTING_DELETE_FAIL } from '@/lib/listing-delete';
import { cn } from '@/lib/utils';

type ListingKind = 'campaign' | 'timeslot';

export function ListingDeleteButton({
  kind,
  id,
  admin = false,
  compact = false,
  className,
  onDeleted,
}: {
  kind: ListingKind;
  id: string;
  admin?: boolean;
  compact?: boolean;
  className?: string;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const label = kind === 'campaign' ? '캠페인' : '크리에이터 상품';
  const href = admin
    ? kind === 'campaign'
      ? `/api/admin/auctions/${encodeURIComponent(id)}`
      : `/api/admin/timeslots/${encodeURIComponent(id)}`
    : kind === 'campaign'
      ? `/api/auctions/${encodeURIComponent(id)}`
      : `/api/timeslots/${encodeURIComponent(id)}`;

  const runDelete = async () => {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(
        href,
        await authRequestInit({ method: 'DELETE', cache: 'no-store' }),
      );
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        errorMessage?: string;
      } | null;
      if (!response.ok) {
        showToast(payload?.errorMessage || payload?.error || LISTING_DELETE_FAIL);
        return;
      }
      showToast(`${label}을 삭제했습니다.`, 'success');
      setOpen(false);
      window.dispatchEvent(new Event(kind === 'campaign' ? 'auctions:changed' : 'timeslots:changed'));
      window.dispatchEvent(new Event('auctions:changed'));
      onDeleted?.();
    } catch {
      showToast(LISTING_DELETE_FAIL);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(true)}
        className={
          className ||
          cn(
            compact
              ? 'inline-flex items-center gap-1 rounded-md border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50'
              : 'inline-flex h-10 items-center justify-center rounded-full border border-rose-200 px-4 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50',
          )
        }
      >
        삭제
      </button>
      <ConfirmModal
        open={open}
        title={`${label} 삭제`}
        description={LISTING_DELETE_CONFIRM}
        confirmLabel="삭제"
        busyLabel="삭제 중..."
        danger
        busy={busy}
        onConfirm={() => {
          void runDelete();
        }}
        onClose={() => {
          if (!busy) {
            setOpen(false);
          }
        }}
      />
    </>
  );
}
