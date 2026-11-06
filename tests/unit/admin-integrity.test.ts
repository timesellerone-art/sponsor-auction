import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyAdminPayoutIntegrity,
  DELETED_CAMPAIGN_LABEL,
} from '../../src/lib/admin-integrity';
import {
  creatorCombinedFeeAmount,
  creatorPayoutAmount,
  floorToTenWon,
  PLATFORM_NET_RATE,
  platformNetFeeFromBid,
} from '../../src/lib/fees';
import type { PayoutItem } from '../../src/types/admin';
import type { AuctionItem } from '../../src/types/auction';

const basePayout: PayoutItem = {
  id: 'payout-1',
  creatorId: 'usr-006',
  creatorName: '민지쇼츠',
  creatorEmail: 'minji@shorts.creator',
  amount: 833_000,
  status: 'pending',
  auctionTitle: '여름 무알콜 맥주 숏폼 캠페인',
  requestedAt: '2026-10-11T09:20:00+09:00',
  auctionId: 'auc-001',
  bidId: 'bid-001',
  bidAmount: 980_000,
};

function auction(status: AuctionItem['status']): AuctionItem {
  return {
    id: 'auc-001',
    title: '여름 무알콜 맥주 숏폼 캠페인',
    platform: 'youtube_shorts',
    budget: 1_200_000,
    description: '테스트',
    status,
    isBlind: false,
    authorId: null,
    authorName: '한강브루어리',
    winnerBidId: null,
    deadline: '2026-10-20T23:59:59+09:00',
    createdAt: '2026-10-01T00:00:00+09:00',
    bidsCount: 1,
  };
}

describe('관리자 정산 정합성', () => {
  it('10원 단위 절사는 원 미만을 버린다', () => {
    assert.equal(floorToTenWon(2670), 2670);
    assert.equal(floorToTenWon(2674), 2670);
    assert.equal(floorToTenWon(11), 10);
    assert.equal(floorToTenWon(0), 0);
  });

  it('플랫폼 순수익은 입찰가의 26.7%를 10원 단위로 절사한다', () => {
    assert.equal(platformNetFeeFromBid(10_000), floorToTenWon(10_000 * PLATFORM_NET_RATE));
    assert.equal(platformNetFeeFromBid(980_000), floorToTenWon(980_000 * PLATFORM_NET_RATE));
  });

  it('최종 정산액은 크리에이터 20% 통합 공제와 같다', () => {
    const [row] = applyAdminPayoutIntegrity([basePayout], [auction('active')]);
    assert.equal(row.netPayoutAmount, creatorPayoutAmount(980_000));
    assert.equal(row.platformFee, creatorCombinedFeeAmount(980_000));
    assert.equal(row.amount, creatorPayoutAmount(980_000));
  });

  it('취소된 캠페인의 정산은 취소/무효가 된다', () => {
    const [row] = applyAdminPayoutIntegrity(
      [{ ...basePayout, status: 'paid' }],
      [auction('cancelled')],
    );
    assert.equal(row.status, 'cancelled');
  });

  it('없는 캠페인은 삭제된 캠페인으로 표기한다', () => {
    const [row] = applyAdminPayoutIntegrity([basePayout], []);
    assert.equal(row.auctionTitle, DELETED_CAMPAIGN_LABEL);
  });
});
