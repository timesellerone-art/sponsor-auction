'use client';

import { useCallback, useState } from 'react';
import { authRequestInit } from '@/lib/auth-request';
import { showToast } from '@/components/Toast';
import { awardBid, getAuctionById, getBidsByAuctionId } from '@/lib/auctions';
import { campaignHoldQuote } from '@/lib/campaign-credit';
import { isUuid } from '@/lib/uuid';
import { VALIDATION } from '@/lib/validation';
import type { AuctionItem, BidItem } from '@/types/auction';

function asAwarded(auction: AuctionItem, bidId: string): AuctionItem {
  return {
    ...auction,
    winnerBidId: auction.winnerBidId || bidId,
    status: auction.status === 'cancelled' ? auction.status : 'closed',
  };
}

export function useAwardCheckout() {
  const [chargeNeeded, setChargeNeeded] = useState<number | null>(null);

  const awardWithCredit = useCallback(async (auction: AuctionItem, bid: BidItem) => {
    try {
      const latest = await getAuctionById(auction.id);
      const current = latest.data ?? auction;
      if (current.winnerBidId && current.winnerBidId !== bid.id) {
        showToast(VALIDATION.alreadyAwarded);
        return null;
      }

      const bidsResult = await getBidsByAuctionId(auction.id);
      const target = (bidsResult.data ?? []).find((item) => item.id === bid.id) ?? bid;

      if (!isUuid(auction.id) || !isUuid(bid.id)) {
        const mocked = await awardBid(auction.id, bid.id);
        if (mocked.error || !mocked.data) {
          showToast(mocked.error ?? '낙찰하지 못했습니다.');
          return null;
        }
        showToast('크레딧에서 예치하고 낙찰했습니다.', 'success');
        window.dispatchEvent(new Event('auctions:changed'));
        return asAwarded(mocked.data, bid.id);
      }

      const response = await fetch(
        `/api/campaigns/${auction.id}/award`,
        await authRequestInit({
          method: 'POST',
          body: JSON.stringify({ bidId: bid.id }),
        }),
      );
      const body = (await response.json().catch(() => null)) as {
        data?: AuctionItem;
        error?: string;
        errorCode?: string;
        neededAmount?: number;
      } | null;

      if (response.status === 402 || body?.errorCode === 'INSUFFICIENT_CREDIT') {
        const needed =
          typeof body?.neededAmount === 'number' && body.neededAmount > 0
            ? body.neededAmount
            : campaignHoldQuote(target.bidAmount).amount;
        setChargeNeeded(needed);
        showToast(body?.error || '크레딧이 부족합니다. 충전 후 다시 낙찰해 주세요.');
        return null;
      }

      if (body?.data?.winnerBidId === bid.id || body?.data?.status === 'closed' || body?.data?.status === 'completed') {
        const awarded = asAwarded(body.data ?? current, bid.id);
        showToast('크레딧에서 예치하고 낙찰했습니다.', 'success');
        window.dispatchEvent(new Event('auctions:changed'));
        return awarded;
      }

      if (!response.ok || !body?.data) {
        showToast(body?.error ?? '낙찰하지 못했습니다.');
        return null;
      }

      showToast('크레딧에서 예치하고 낙찰했습니다.', 'success');
      window.dispatchEvent(new Event('auctions:changed'));
      return asAwarded(body.data, bid.id);
    } catch (error) {
      console.warn('[SponsorAuction] 크레딧 낙찰 중 예외가 발생했습니다.', error);
      showToast('낙찰을 시작하지 못했습니다. 캠페인 상태는 그대로입니다.');
      return null;
    }
  }, []);

  const closeCharge = useCallback(() => {
    setChargeNeeded(null);
  }, []);

  return { awardWithCredit, chargeNeeded, closeCharge };
}
