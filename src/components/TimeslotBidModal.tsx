'use client';

import { useId, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { EscrowNotice } from '@/components/EscrowNotice';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { nextInventoryMinBid } from '@/lib/auction-engine';
import { placeTimeSlotBid } from '@/lib/timeslots';
import { formatWon } from '@/lib/utils';
import { MIN_PROPOSAL_LENGTH } from '@/lib/validation';
import { hasOffPlatformContact } from '@/utils/filter';
import type { TimeSlotItem } from '@/types/timeslot';

export function TimeslotBidModal({
  open,
  slot,
  onClose,
}: {
  open: boolean;
  slot: TimeSlotItem | null;
  onClose: () => void;
}) {
  if (!open || !slot) {
    return null;
  }

  return (
    <TimeslotBidForm
      key={`${slot.id}:${slot.currentHighestBid}`}
      slot={slot}
      onClose={onClose}
    />
  );
}

function TimeslotBidForm({
  slot,
  onClose,
}: {
  slot: TimeSlotItem;
  onClose: () => void;
}) {
  const titleId = useId();
  const { user } = useAuth();
  const { requireAdvertiser } = useRequireAuth();
  const minBid = nextInventoryMinBid(slot.startingPrice, slot.currentHighestBid);
  const [amount, setAmount] = useState(String(minBid));
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { isBusy, run } = useActionLock();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run('slot-bid', async () => {
      if (!requireAdvertiser('advertiser-auth', `/inventory/${slot.id}`) || !user) {
        return;
      }
      const bidAmount = Number(amount);
      if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
        setError(`입찰가는 ${formatWon(minBid)} 이상이어야 합니다.`);
        return;
      }
      if (message.trim().length < MIN_PROPOSAL_LENGTH) {
        setError(`메시지는 ${MIN_PROPOSAL_LENGTH}자 이상 입력해 주세요.`);
        return;
      }
      if (hasOffPlatformContact(message)) {
        setError('플랫폼 우회 연락처는 사용할 수 없습니다.');
        return;
      }

      const payload = {
        timeSlotId: slot.id,
        advertiserId: user.id,
        advertiserName: user.name,
        bidAmount,
        message: message.trim(),
      };

      let result: Awaited<ReturnType<typeof placeTimeSlotBid>>;
      try {
        const response = await fetch(`/api/timeslots/${slot.id}/bids`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = (await response.json().catch(() => null)) as {
          data?: Awaited<ReturnType<typeof placeTimeSlotBid>>['data'];
          error?: string;
          errorMessage?: string;
        } | null;
        if (response.ok && json?.data) {
          result = { data: json.data, error: null };
        } else {
          result = {
            data: null,
            error: json?.errorMessage ?? json?.error ?? '입찰을 등록하지 못했습니다.',
          };
        }
      } catch {
        result = await placeTimeSlotBid(payload);
      }

      if (result.error) {
        setError(result.error);
        showToast(result.error);
        return;
      }
      showToast('입찰을 등록했습니다.', 'success');
      window.dispatchEvent(new Event('timeslots:changed'));
      onClose();
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-zinc-950/40 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="닫기" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl sm:p-5"
        aria-labelledby={titleId}
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-base font-bold text-zinc-950">
            인벤토리 입찰
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 hover:bg-zinc-100">
            <X className="size-5" />
          </button>
        </div>
        <p className="mt-2 text-sm text-zinc-500">
          현재 최고가 {formatWon(slot.currentHighestBid || slot.startingPrice)} · 최소{' '}
          {formatWon(minBid)}
        </p>
        <div className="mt-3">
          <EscrowNotice compact />
        </div>
        <label className="mt-4 block text-sm font-medium text-zinc-800" htmlFor="slot-bid-amount">
          입찰가
        </label>
        <input
          id="slot-bid-amount"
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="mt-1 h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm"
        />
        <label className="mt-3 block text-sm font-medium text-zinc-800" htmlFor="slot-bid-message">
          메시지
        </label>
        <textarea
          id="slot-bid-message"
          rows={4}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-1 w-full resize-y rounded-xl border border-zinc-200 px-3 py-2 text-sm"
        />
        {error ? (
          <p className="mt-2 text-sm text-rose-600" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isBusy}
          className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-teal-700 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
          입찰하기
        </button>
      </form>
    </div>,
    document.body,
  );
}
