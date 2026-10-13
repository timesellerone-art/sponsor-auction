'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AccessGuard } from '@/components/AccessGuard';
import { AuctionCard, AuctionCardSkeleton } from '@/components/AuctionCard';
import { BidProposalList } from '@/components/BidProposalList';
import { PaymentCheckoutModal } from '@/components/PaymentCheckoutModal';
import { useActionLock } from '@/hooks/useActionLock';
import { useAwardCheckout } from '@/hooks/useAwardCheckout';
import { useRequireAuth } from '@/hooks/useRequireAuth';
import { getAuctions, getBids } from '@/lib/auctions';
import { getMyAuctionIds } from '@/lib/my-campaigns';
import type { AuctionItem, BidItem } from '@/types/auction';

export default function MyCampaignsPage() {
  const { requireAdvertiser } = useRequireAuth();
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [bids, setBids] = useState<BidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [awardBusyId, setAwardBusyId] = useState<string | null>(null);
  const { run: runAward } = useActionLock();
  const { checkout, startCheckout, closeCheckout } = useAwardCheckout();

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [auctionResult, bidResult] = await Promise.all([
          getAuctions(),
          getBids(),
        ]);
        if (cancelled) {
          return;
        }

        const mine = new Set(getMyAuctionIds());
        const list = Array.isArray(auctionResult.data)
          ? auctionResult.data.filter((item) => mine.has(item.id))
          : [];
        setAuctions(list);
        setBids(Array.isArray(bidResult.data) ? bidResult.data : []);
        setError(list.length === 0 ? '등록한 역경매가 없습니다.' : null);
      } catch {
        if (!cancelled) {
          setAuctions([]);
          setBids([]);
          setError('캠페인을 불러오지 못했습니다.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    const onChanged = () => {
      void load();
    };
    window.addEventListener('auctions:changed', onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener('auctions:changed', onChanged);
    };
  }, []);

  const bidsByAuction = useMemo(() => {
    const grouped = new Map<string, BidItem[]>();
    for (const bid of bids) {
      const list = grouped.get(bid.auctionId) ?? [];
      list.push(bid);
      grouped.set(bid.auctionId, list);
    }
    return grouped;
  }, [bids]);

  const handleAward = async (auction: AuctionItem, bid: BidItem) => {
    if (!auction?.id || !bid?.id) {
      return;
    }
    if (!requireAdvertiser('award-auth', '/my')) {
      return;
    }

    await runAward(bid.id, async () => {
      setAwardBusyId(bid.id);
      try {
        await startCheckout(auction, bid);
      } finally {
        setAwardBusyId(null);
      }
    });
  };

  return (
    <AccessGuard allow="advertiser">
    <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col px-4 py-6 sm:px-6 sm:py-10">
      <p className="text-sm font-semibold tracking-wide text-teal-800">광고주</p>
      <h1 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">
        내 역경매
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-zinc-500">
        등록한 캠페인에 제출된 크리에이터 제안을 확인하고, 여기서 바로 낙찰할 수
        있습니다.
      </p>

      {loading ? (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <AuctionCardSkeleton key={index} />
          ))}
        </div>
      ) : auctions.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <p className="text-base font-medium text-zinc-800">
            {error || '등록한 역경매가 없습니다'}
          </p>
          <Link
            href="/"
            className="mt-4 inline-flex h-10 items-center justify-center rounded-full bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800"
          >
            역경매 둘러보기
          </Link>
        </div>
      ) : (
        <div className="mt-8 flex flex-col gap-8">
          {auctions.map((auction) => (
            <div key={auction.id} className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <div className="min-w-0">
                <AuctionCard auction={auction} />
                <Link
                  href={`/auctions/${auction.id}#proposals`}
                  className="mt-2 inline-flex h-10 w-full items-center justify-center rounded-full border border-zinc-200 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
                >
                  상세 페이지로 이동
                </Link>
              </div>
              <BidProposalList
                auction={auction}
                bids={bidsByAuction.get(auction.id) ?? []}
                loading={false}
                error={null}
                busyId={awardBusyId}
                allowAward
                onAward={(bid) => handleAward(auction, bid)}
              />
            </div>
          ))}
        </div>
      )}
      <PaymentCheckoutModal
        open={Boolean(checkout)}
        checkout={checkout}
        onClose={closeCheckout}
      />
    </div>
    </AccessGuard>
  );
}
