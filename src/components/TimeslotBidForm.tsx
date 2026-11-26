'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { CreditChargeModal } from '@/components/CreditChargeModal';
import { EscrowNotice } from '@/components/EscrowNotice';
import { FeeBreakdownCard } from '@/components/fee/FeeBreakdownCard';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { nextInventoryMinBid } from '@/lib/auction-engine';
import { authRequestInit } from '@/lib/auth-request';
import { campaignHoldQuote } from '@/lib/campaign-credit';
import { placeTimeSlotBid } from '@/lib/timeslots';
import { formatWon } from '@/lib/utils';
import { MIN_PROPOSAL_LENGTH, VALIDATION } from '@/lib/validation';
import { hasAuthRole } from '@/types/auth';
import type { TimeSlotItem } from '@/types/timeslot';
import { hasOffPlatformContact } from '@/utils/filter';

export function TimeslotBidForm({
  slot,
  onSubmitted,
}: {
  slot: TimeSlotItem;
  onSubmitted?: () => void;
}) {
  const { user, activeRole } = useAuth();
  const { requireUser } = useRequireAuth();
  const minBid = nextInventoryMinBid(slot.startingPrice, slot.currentHighestBid);
  const [amount, setAmount] = useState(String(minBid));
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [chargeOpen, setChargeOpen] = useState(false);
  const { isBusy, run } = useActionLock();

  const bidAmount = Number(amount);
  const quoteAmount = useMemo(() => {
    const value = Number.isFinite(bidAmount) && bidAmount > 0 ? bidAmount : minBid;
    return campaignHoldQuote(value).amount;
  }, [bidAmount, minBid]);

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
      setError('본인 상품에는 제안할 수 없습니다.');
      return false;
    }
    if (!canSubmitBid) {
      setError('크리에이터 상품 제안은 광고주 계정에서만 가능합니다.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await run('slot-bid', async () => {
      if (!requireUser('auth-required', `/timeslots/${slot.id}`) || !user) {
        return;
      }
      if (!ensureAdvertiser()) {
        return;
      }
      if (!Number.isFinite(bidAmount) || bidAmount < minBid) {
        setError(`제안가는 ${formatWon(minBid)} 이상이어야 합니다.`);
        return;
      }
      if (message.trim().length < MIN_PROPOSAL_LENGTH) {
        setError(`콘텐츠/협찬 메시지는 ${MIN_PROPOSAL_LENGTH}자 이상 입력해 주세요.`);
        return;
      }
      if (hasOffPlatformContact(message)) {
        setError(VALIDATION.offPlatformContact);
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
        const response = await fetch(
          `/api/timeslots/${slot.id}/bids`,
          await authRequestInit({
            method: 'POST',
            body: JSON.stringify(payload),
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
            error: json?.errorMessage ?? json?.error ?? '제안을 등록하지 못했습니다.',
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
      showToast('제안을 등록했습니다.', 'success');
      window.dispatchEvent(new Event('timeslots:changed'));
      setMessage('');
      setError(null);
      onSubmitted?.();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5">
      <h2 className="text-base font-bold text-zinc-950">크리에이터 상품 제안</h2>
      <p className="mt-1 text-sm text-zinc-500">
        시작가 {formatWon(slot.startingPrice)} · 현재 최고가{' '}
        {formatWon(slot.currentHighestBid || slot.startingPrice)} · 최소 {formatWon(minBid)}
      </p>
      <div className="mt-3">
        <EscrowNotice compact />
      </div>
      <label className="mt-4 block text-sm font-medium text-zinc-800" htmlFor="slot-bid-amount">
        제안 금액
      </label>
      <input
        id="slot-bid-amount"
        inputMode="numeric"
        value={amount}
        onChange={(event) => setAmount(event.target.value)}
        className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
      />
      <p className="mt-1 text-xs text-zinc-500">시작가 이상으로 입력해 주세요.</p>
      <label className="mt-3 block text-sm font-medium text-zinc-800" htmlFor="slot-bid-message">
        콘텐츠/협찬 메시지
      </label>
      <textarea
        id="slot-bid-message"
        rows={4}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="진행할 콘텐츠와 협찬 조건을 구체적으로 적어 주세요."
        className="mt-1 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
      />
      <div className="mt-4">
        <FeeBreakdownCard role="advertiser" amount={Number.isFinite(bidAmount) ? bidAmount : 0} />
      </div>
      <p className="mt-3 text-xs leading-5 text-zinc-500">
        선정되면 보유 크레딧에서 선결제됩니다. 잔액이 부족하면 먼저 충전한 뒤 제안을 제출해 주세요.
      </p>
      {error ? (
        <p className="mt-2 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => {
            if (!ensureAdvertiser()) {
              return;
            }
            setChargeOpen(true);
          }}
          className="inline-flex h-11 items-center justify-center rounded-full border border-zinc-300 bg-white text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
        >
          선결제
        </button>
        <button
          type="submit"
          disabled={isBusy}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-clink text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-60"
        >
          {isBusy ? <Loader2 className="size-4 animate-spin" /> : null}
          제안 제출
        </button>
      </div>
      <CreditChargeModal
        open={chargeOpen}
        neededAmount={quoteAmount}
        hint={`크리에이터 상품 선정 시 차감액(공급가액 + 부가세 10%)은 ${formatWon(quoteAmount)}입니다. 충전 후 다시 제안해 주세요.`}
        onClose={() => setChargeOpen(false)}
      />
    </form>
  );
}
