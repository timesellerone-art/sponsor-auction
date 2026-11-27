'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { EscrowNotice } from '@/components/EscrowNotice';
import { FeeBreakdownCard } from '@/components/fee/FeeBreakdownCard';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { authRequestInit } from '@/lib/auth-request';
import { placeTimeSlotBid } from '@/lib/timeslots';
import { formatWon } from '@/lib/utils';
import { MIN_PROPOSAL_LENGTH, VALIDATION } from '@/lib/validation';
import { hasAuthRole } from '@/types/auth';
import type { TimeSlotBidItem, TimeSlotItem } from '@/types/timeslot';
import { hasOffPlatformContact } from '@/utils/filter';

export function TimeslotBidForm({
  slot,
  onSubmitted,
}: {
  slot: TimeSlotItem;
  onSubmitted?: (bid?: TimeSlotBidItem | null) => void;
}) {
  const { user, activeRole } = useAuth();
  const { requireUser } = useRequireAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { isBusy, run } = useActionLock();

  const bidAmount = useMemo(() => {
    return Number.isFinite(slot.startingPrice) && slot.startingPrice > 0 ? slot.startingPrice : 0;
  }, [slot.startingPrice]);

  const canSubmitBid = Boolean(
    user &&
      activeRole !== 'creator' &&
      (hasAuthRole(user, 'advertiser') || hasAuthRole(user, 'admin')) &&
      !(slot.creatorId && user.id === slot.creatorId),
  );

  const ensureAdvertiser = () => {
    if (!user) {
      return false;
    }
    if (slot.creatorId && user.id === slot.creatorId) {
      setError('본인 상품에는 신청할 수 없습니다.');
      return false;
    }
    if (!canSubmitBid) {
      setError('크리에이터 상품 신청은 광고주 계정에서만 가능합니다.');
      return false;
    }
    return true;
  };

  const submitProposal = async () => {
    if (!requireUser('auth-required', `/timeslots/${slot.id}`) || !user) {
      return false;
    }
    if (!ensureAdvertiser()) {
      return false;
    }
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      setError(VALIDATION.startingPriceRequired);
      return false;
    }
    if (message.trim().length < MIN_PROPOSAL_LENGTH) {
      setError(`콘텐츠/협찬 메시지는 ${MIN_PROPOSAL_LENGTH}자 이상 입력해 주세요.`);
      return false;
    }
    if (hasOffPlatformContact(message)) {
      setError(VALIDATION.offPlatformContact);
      return false;
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
      const response = await fetch(
        `/api/timeslots/${encodeURIComponent(slot.id)}/bids`,
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({ ...payload, timeSlotId: slot.id }),
        }),
      );
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
          error: json?.errorMessage ?? json?.error ?? '신청을 등록하지 못했습니다.',
        };
      }
    } catch {
      result = await placeTimeSlotBid(payload);
    }

    if (result.error) {
      setError(result.error);
      showToast(result.error);
      return false;
    }
    showToast('제작 신청을 등록했습니다.', 'success');
    window.dispatchEvent(new Event('timeslots:changed'));
    setMessage('');
    setError(null);
    onSubmitted?.(result.data);
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run('slot-bid', async () => {
      await submitProposal();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <h2 className="text-base font-bold text-zinc-950">크리에이터 상품 신청</h2>
      <p className="mt-1 text-sm text-zinc-500">
        캠페인 단가 {formatWon(bidAmount)}에 동의한 뒤 콘셉트·제작 방향으로 신청합니다.
      </p>
      <div className="mt-3">
        <EscrowNotice compact />
      </div>
      <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3">
        <p className="text-xs font-semibold tracking-wide text-zinc-500">캠페인 단가</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-zinc-950">{formatWon(bidAmount)}</p>
        <p className="mt-1 text-xs leading-5 text-zinc-500">
          크리에이터가 사전에 책정한 금액입니다. 금액은 수정할 수 없습니다.
        </p>
      </div>
      <label className="mt-3 block text-sm font-medium text-zinc-800" htmlFor="slot-bid-message">
        콘텐츠/협찬 메시지
      </label>
      <textarea
        id="slot-bid-message"
        rows={4}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="진행할 콘텐츠와 제작 방향을 구체적으로 적어 주세요."
        className="mt-1 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
      />
      <div className="mt-4">
        <FeeBreakdownCard role="advertiser" amount={bidAmount} />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">
        크리에이터가 신청을 선정하면 단가 1건을 토스페이먼츠 에스크로로 결제합니다.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4">
        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
          제작 신청
        </button>
      </div>
    </form>
  );
}
