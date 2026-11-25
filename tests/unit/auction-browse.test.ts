import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { browseAuctions, isOpenForBid } from '../../src/lib/auction-browse';
import type { AuctionItem } from '../../src/types/auction';

function auction(partial: Partial<AuctionItem>): AuctionItem {
  return {
    id: partial.id ?? 'auc-open',
    title: partial.title ?? '오픈 캠페인',
    platform: partial.platform ?? 'instagram_reels',
    budget: partial.budget ?? 1_000_000,
    description: partial.description ?? '검증용 캠페인',
    status: partial.status ?? 'active',
    isBlind: partial.isBlind ?? false,
    authorId: partial.authorId ?? 'user-1',
    authorName: partial.authorName ?? '광고주',
    winnerBidId: partial.winnerBidId ?? null,
    deadline: partial.deadline ?? '2026-12-31T23:59:59+09:00',
    createdAt: partial.createdAt ?? '2026-11-01T00:00:00+09:00',
    bidsCount: partial.bidsCount ?? 0,
  };
}

describe('auction browse open filter', () => {
  it('낙찰·매칭이 끝난 캠페인은 진행 중인 오픈 목록에서 뺀다', () => {
    assert.equal(isOpenForBid(auction({ status: 'active', winnerBidId: null })), true);
    assert.equal(isOpenForBid(auction({ status: 'active', winnerBidId: 'bid-1' })), false);
    assert.equal(isOpenForBid(auction({ status: 'closed', winnerBidId: 'bid-1' })), false);
    assert.equal(isOpenForBid(auction({ status: 'matched', winnerBidId: null })), false);
    assert.equal(isOpenForBid(auction({ status: 'active', isBlind: true })), false);

    const browsed = browseAuctions(
      [
        auction({ id: 'open', title: '모집 중' }),
        auction({ id: 'awarded-active', title: '낙찰 완료', winnerBidId: 'bid-1' }),
        auction({ id: 'closed', title: '마감', status: 'closed', winnerBidId: 'bid-2' }),
      ],
      { query: '', platform: 'all', sort: 'newest' },
    );
    assert.deepEqual(
      browsed.open.map((item) => item.id),
      ['open'],
    );
    assert.ok(browsed.closed.some((item) => item.id === 'awarded-active'));
    assert.ok(browsed.closed.some((item) => item.id === 'closed'));
  });
});
