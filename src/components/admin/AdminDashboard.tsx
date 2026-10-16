'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminAuctionTable } from '@/components/admin/AdminAuctionTable';
import { AdminBidTable } from '@/components/admin/AdminBidTable';
import { AdminEmptyState } from '@/components/admin/AdminEmptyState';
import { AccessGuard } from '@/components/AccessGuard';
import { AdminPayoutTable } from '@/components/admin/AdminPayoutTable';
import { AdminStats } from '@/components/admin/AdminStats';
import { AdminUserTable } from '@/components/admin/AdminUserTable';
import { showToast } from '@/components/Toast';
import { useActionLock } from '@/hooks/useActionLock';
import {
  ADMIN_UPDATE_FAIL_MESSAGE,
  approvePayout,
  getAdminBids,
  getPayouts,
  getProfiles,
  savePayoutMemo,
  updateProfileStatus,
} from '@/lib/admin';
import { applyPaidPayoutLocal } from '@/lib/payouts';
import { VALIDATION } from '@/lib/validation';
import {
  UPDATE_FAIL_MESSAGE,
  deleteAuction,
  getAuctions,
  updateAuctionBlind,
} from '@/lib/auctions';
import { cn } from '@/lib/utils';
import type { PayoutItem, ProfileItem } from '@/types/admin';
import type { AuctionItem, BidItem } from '@/types/auction';

type TabId = 'auctions' | 'users' | 'payouts' | 'bids';

function asAuctionList(value: unknown): AuctionItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is AuctionItem => {
    return Boolean(item && typeof item === 'object' && 'id' in item);
  });
}

function asBidList(value: unknown): BidItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is BidItem => {
    return Boolean(item && typeof item === 'object' && 'id' in item);
  });
}

function asProfileList(value: unknown): ProfileItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is ProfileItem => {
    return Boolean(item && typeof item === 'object' && 'id' in item);
  });
}

function asPayoutList(value: unknown): PayoutItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is PayoutItem => {
    return Boolean(item && typeof item === 'object' && 'id' in item);
  });
}

export function AdminDashboard({
  initialPayouts = [],
  initialBids = [],
}: {
  initialPayouts?: PayoutItem[];
  initialBids?: BidItem[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('auctions');
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [bids, setBids] = useState<BidItem[]>(() => asBidList(initialBids));
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutItem[]>(() => asPayoutList(initialPayouts));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { busyKey: busyId, isBusy, run } = useActionLock();

  const fetchPayouts = useCallback(async (keepPaid: PayoutItem[] = []) => {
    try {
      const payoutResult = await getPayouts(asPayoutList(initialPayouts));
      setPayouts((prev) => {
        const fresh = asPayoutList(payoutResult.data);
        const paid = [
          ...keepPaid,
          ...asPayoutList(initialPayouts).filter((item) => item.status === 'paid'),
          ...prev.filter((item) => item.status === 'paid'),
        ];
        return paid.reduce((list, item) => applyPaidPayoutLocal(list, item), fresh);
      });
      if (payoutResult.data.length === 0 && payoutResult.error) {
        setLoadError(payoutResult.error);
      }
    } catch (error) {
      console.warn('[SponsorAuction] 정산 목록 재조회 실패', error);
    }
  }, [initialPayouts]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [auctionResult, bidResult, profileResult, payoutResult] =
        await Promise.all([
          getAuctions(),
          getAdminBids(asBidList(initialBids)),
          getProfiles(),
          getPayouts(asPayoutList(initialPayouts)),
        ]);

      setAuctions(asAuctionList(auctionResult.data));
      setBids(asBidList(bidResult.data));
      setProfiles(asProfileList(profileResult.data));
      setPayouts(asPayoutList(payoutResult.data));

      const firstError =
        (auctionResult.data.length === 0 ? auctionResult.error : null) ||
        (profileResult.data.length === 0 ? profileResult.error : null) ||
        (payoutResult.data.length === 0 ? payoutResult.error : null) ||
        (bidResult.data.length === 0 ? bidResult.error : null);
      setLoadError(firstError);
    } catch (error) {
      console.warn('[SponsorAuction] 관리자 데이터를 불러오지 못했습니다.', error);
      setAuctions([]);
      setBids([]);
      setProfiles([]);
      setPayouts([]);
      setLoadError('데이터를 불러오지 못했습니다.');
      showToast('데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [initialBids, initialPayouts]);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const safeAuctions = asAuctionList(auctions);
    const safeProfiles = asProfileList(profiles);
    const members = safeProfiles.filter((item) => item.role !== 'admin');

    return {
      auctionCount: safeAuctions.length,
      activeAuctionCount: safeAuctions.filter(
        (item) => item.status === 'active' && !item.isBlind,
      ).length,
      advertiserCount: members.filter((item) => item.role === 'advertiser')
        .length,
      creatorCount: members.filter((item) => item.role === 'creator').length,
      blindedCount: safeAuctions.filter((item) => item.isBlind).length,
    };
  }, [auctions, profiles]);

  const handleBlind = async (auction: AuctionItem) => {
    if (!auction?.id) {
      return;
    }
    if (isBusy) {
      showToast(VALIDATION.actionInFlight);
      return;
    }

    const latest = auctions.find((item) => item.id === auction.id) ?? auction;
    if (latest.isBlind) {
      showToast(VALIDATION.blindAlready);
      return;
    }

    const confirmed = window.confirm(
      `"${auction.title || '제목 없음'}"을 블라인드 처리할까요?`,
    );
    if (!confirmed) {
      return;
    }

    await run(auction.id, async () => {
      try {
        const current = auctions.find((item) => item.id === auction.id) ?? auction;
        if (current.isBlind) {
          showToast(VALIDATION.blindAlready);
          return;
        }

        const result = await updateAuctionBlind(auction.id, true);
        if (result.error || !result.data) {
          showToast(result.error ?? UPDATE_FAIL_MESSAGE);
          return;
        }

        showToast('블라인드 처리했습니다.', 'success');
        await load();
        window.dispatchEvent(new Event('auctions:changed'));
      } catch {
        showToast(UPDATE_FAIL_MESSAGE);
      }
    });
  };

  const handleUnblind = async (auction: AuctionItem) => {
    if (!auction?.id) {
      return;
    }
    if (isBusy) {
      showToast(VALIDATION.actionInFlight);
      return;
    }

    const latest = auctions.find((item) => item.id === auction.id) ?? auction;
    if (!latest.isBlind) {
      showToast(VALIDATION.unblindAlready);
      return;
    }

    const confirmed = window.confirm(
      `"${auction.title || '제목 없음'}"의 블라인드를 해제할까요?`,
    );
    if (!confirmed) {
      return;
    }

    await run(auction.id, async () => {
      try {
        const current = auctions.find((item) => item.id === auction.id) ?? auction;
        if (!current.isBlind) {
          showToast(VALIDATION.unblindAlready);
          return;
        }

        const result = await updateAuctionBlind(auction.id, false);
        if (result.error || !result.data) {
          showToast(result.error ?? UPDATE_FAIL_MESSAGE);
          return;
        }

        showToast('블라인드를 해제했습니다.', 'success');
        await load();
        window.dispatchEvent(new Event('auctions:changed'));
      } catch {
        showToast(UPDATE_FAIL_MESSAGE);
      }
    });
  };

  const handleDelete = async (auction: AuctionItem) => {
    if (!auction?.id) {
      return;
    }
    if (isBusy) {
      showToast(VALIDATION.actionInFlight);
      return;
    }

    const confirmed = window.confirm(
      `"${auction.title || '제목 없음'}"을 삭제할까요? 연결된 입찰도 함께 사라질 수 있습니다.`,
    );
    if (!confirmed) {
      return;
    }

    await run(auction.id, async () => {
      try {
        const exists = auctions.some((item) => item.id === auction.id);
        if (!exists) {
          showToast(VALIDATION.alreadyProcessed);
          return;
        }

        const result = await deleteAuction(auction.id);
        if (result.error || !result.data) {
          showToast(result.error ?? UPDATE_FAIL_MESSAGE);
          return;
        }

        showToast('삭제했습니다.', 'success');
        await load();
        window.dispatchEvent(new Event('auctions:changed'));
      } catch {
        showToast(UPDATE_FAIL_MESSAGE);
      }
    });
  };

  const handleToggleProfileStatus = async (profile: ProfileItem) => {
    if (!profile?.id || profile.role === 'admin') {
      return;
    }
    if (isBusy) {
      showToast(VALIDATION.actionInFlight);
      return;
    }

    const latest = profiles.find((item) => item.id === profile.id) ?? profile;
    const nextStatus = latest.status === 'suspended' ? 'active' : 'suspended';
    const confirmed = window.confirm(
      nextStatus === 'suspended'
        ? `"${profile.name || '회원'}"을 정지할까요?`
        : `"${profile.name || '회원'}"의 정지를 해제할까요?`,
    );
    if (!confirmed) {
      return;
    }

    await run(profile.id, async () => {
      try {
        const current = profiles.find((item) => item.id === profile.id) ?? latest;
        if (current.role === 'admin') {
          showToast('관리자 계정은 제재할 수 없습니다.');
          return;
        }
        if (current.status === nextStatus) {
          showToast(VALIDATION.sanctionAlready);
          return;
        }

        const result = await updateProfileStatus(profile.id, nextStatus);
        if (result.error || !result.data) {
          showToast(result.error ?? ADMIN_UPDATE_FAIL_MESSAGE);
          return;
        }

        setProfiles((prev) =>
          prev.map((item) => (item.id === result.data?.id ? result.data : item)),
        );
        showToast(
          nextStatus === 'suspended'
            ? '회원을 정지했습니다.'
            : '정지를 해제했습니다.',
          'success',
        );
        await load();
      } catch {
        showToast(ADMIN_UPDATE_FAIL_MESSAGE);
      }
    });
  };

  const handleApprovePayout = async (
    payout: PayoutItem,
    options?: { silent?: boolean },
  ): Promise<PayoutItem | null> => {
    if (!payout?.id) {
      return null;
    }
    if (isBusy) {
      if (!options?.silent) {
        showToast(VALIDATION.actionInFlight);
      }
      return null;
    }

    const latest = payouts.find((item) => item.id === payout.id) ?? payout;
    if (latest.status !== 'pending') {
      if (!options?.silent) {
        showToast(VALIDATION.payoutAlready);
      }
      return null;
    }

    if (!options?.silent) {
      const confirmed = window.confirm(
        `"${payout.creatorName || '크리에이터'}"의 정산을 지급 처리할까요?`,
      );
      if (!confirmed) {
        return null;
      }
    }

    let paidItem: PayoutItem | null = null;
    await run(payout.id, async () => {
      try {
        const current = payouts.find((item) => item.id === payout.id) ?? latest;
        if (current.status !== 'pending') {
          showToast(VALIDATION.payoutAlready);
          return;
        }

        const result = await approvePayout(payout);
        if (result.error || !result.data) {
          const detail = result.error || '알 수 없는 오류';
          console.error('[SponsorAuction] 지급 처리 실패', detail);
          showToast(`지급 처리 실패: ${detail}`);
          return;
        }

        const paid: PayoutItem = {
          ...current,
          ...result.data,
          id: current.id,
          status: 'paid',
          paidAt: result.data.paidAt || new Date().toISOString(),
        };
        paidItem = paid;
        setPayouts((prev) => applyPaidPayoutLocal(prev, paid));
        if (!options?.silent) {
          showToast('지급 처리했습니다.', 'success');
        }
        router.refresh();
        await fetchPayouts([paid]);
      } catch (error) {
        const detail =
          error instanceof Error ? error.message : '알 수 없는 오류';
        console.error('[SponsorAuction] 지급 처리 예외', error);
        showToast(`지급 처리 실패: ${detail}`);
      }
    });
    return paidItem;
  };

  const handleSavePayoutMemo = async (payout: PayoutItem, memo: string) => {
    try {
      const result = await savePayoutMemo(payout, memo);
      if (result.error || !result.data) {
        showToast(`메모 저장 실패: ${result.error || '알 수 없는 오류'}`);
        return null;
      }
      const saved = result.data;
      setPayouts((prev) =>
        prev.map((item) =>
          item.id === payout.id ? { ...item, ...saved, adminMemo: memo } : item,
        ),
      );
      showToast('메모를 저장했습니다.', 'success');
      return result.data;
    } catch (error) {
      const detail = error instanceof Error ? error.message : '알 수 없는 오류';
      showToast(`메모 저장 실패: ${detail}`);
      return null;
    }
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'auctions', label: '역경매 관리' },
    { id: 'users', label: '회원 관리' },
    { id: 'payouts', label: '정산 관리' },
    { id: 'bids', label: '입찰 관리' },
  ];

  return (
    <AccessGuard allow="admin">
      <div className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
        <div>
          <p className="text-sm font-semibold tracking-wide text-teal-800">Admin</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-950 sm:text-3xl">
            관리자 대시보드
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            역경매, 회원, 정산을 한곳에서 모니터링하고 처리할 수 있습니다.
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-2xl bg-white"
              />
            ))}
          </div>
        ) : (
          <AdminStats
            auctionCount={stats.auctionCount}
            activeAuctionCount={stats.activeAuctionCount}
            advertiserCount={stats.advertiserCount}
            creatorCount={stats.creatorCount}
            blindedCount={stats.blindedCount}
          />
        )}

        <div className="flex min-w-0 gap-1 overflow-x-auto rounded-full bg-zinc-100 p-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                'h-9 shrink-0 flex-1 rounded-full px-3 text-sm font-semibold',
                tab === item.id
                  ? 'bg-white text-zinc-950 shadow-sm'
                  : 'text-zinc-500',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="h-64 w-full min-w-0 animate-pulse rounded-2xl bg-white" />
        ) : tab === 'auctions' ? (
          asAuctionList(auctions).length === 0 ? (
            <AdminEmptyState message={loadError ?? undefined} />
          ) : (
            <AdminAuctionTable
              auctions={asAuctionList(auctions)}
              profiles={asProfileList(profiles)}
              busyId={busyId}
              onBlind={handleBlind}
              onUnblind={handleUnblind}
              onDelete={handleDelete}
            />
          )
        ) : tab === 'users' ? (
          asProfileList(profiles).length === 0 ? (
            <AdminEmptyState message={loadError ?? undefined} />
          ) : (
            <AdminUserTable
              profiles={asProfileList(profiles)}
              busyId={busyId}
              onToggleStatus={handleToggleProfileStatus}
            />
          )
        ) : tab === 'payouts' ? (
          asPayoutList(payouts).length === 0 ? (
            <AdminEmptyState message={loadError ?? undefined} />
          ) : (
            <AdminPayoutTable
              payouts={asPayoutList(payouts)}
              busyId={busyId}
              onApprove={handleApprovePayout}
              onSaveMemo={handleSavePayoutMemo}
              onRefresh={() => fetchPayouts()}
            />
          )
        ) : asBidList(bids).length === 0 ? (
          <AdminEmptyState message={loadError ?? undefined} />
        ) : (
          <AdminBidTable
            bids={asBidList(bids)}
            auctions={asAuctionList(auctions)}
            payouts={asPayoutList(payouts)}
            profiles={asProfileList(profiles)}
          />
        )}
      </div>
    </AccessGuard>
  );
}
