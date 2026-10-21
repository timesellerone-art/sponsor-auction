'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { showToast } from '@/components/Toast';
import { getAuctionById, getBidsByAuctionId } from '@/lib/auctions';
import { prepareAwardPayment } from '@/lib/payments/client';
import { getAwardBlockReason, VALIDATION } from '@/lib/validation';
import type { PreparePaymentResult } from '@/types/payment';
import type { AuctionItem, BidItem } from '@/types/auction';

export function useAwardCheckout() {
  const { user } = useAuth();
  const [checkout, setCheckout] = useState<PreparePaymentResult | null>(null);

  const startCheckout = useCallback(
    async (auction: AuctionItem, bid: BidItem) => {
      try {
        const latest = await getAuctionById(auction.id);
        const blocked = getAwardBlockReason(latest.data ?? auction);
        if (blocked) {
          showToast(blocked);
          return false;
        }

        const bidsResult = await getBidsByAuctionId(auction.id);
        const target = (bidsResult.data ?? []).find((item) => item.id === bid.id);
        if (!target) {
          showToast('해당 제안을 찾을 수 없습니다.');
          return false;
        }
        if (target.status === 'selected') {
          showToast(VALIDATION.alreadyAwarded);
          return false;
        }

        const prepared = await prepareAwardPayment({
          auction: latest.data ?? auction,
          bid: target,
          customerKey: user?.id,
        });
        if (prepared.error || !prepared.data) {
          showToast(prepared.error ?? '결제를 준비하지 못했습니다.');
          return false;
        }

        setCheckout(prepared.data);
        return true;
      } catch (error) {
        console.warn('[SponsorAuction] 낙찰 결제 준비 중 예외가 발생했습니다.', error);
        showToast('결제를 시작하지 못했습니다. 낙찰은 진행되지 않았습니다.');
        return false;
      }
    },
    [user],
  );

  const closeCheckout = useCallback(() => {
    setCheckout(null);
  }, []);

  return { checkout, startCheckout, closeCheckout };
}
