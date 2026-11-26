import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isTimeSlotOpen, type TimeSlotItem } from '../../src/types/timeslot';

function slot(overrides: Partial<TimeSlotItem>): TimeSlotItem {
  return {
    id: 'slot-test',
    creatorId: 'usr-1',
    creatorName: '크리에이터',
    title: '테스트 슬롯',
    platform: 'youtube_shorts',
    description: '설명입니다.',
    expectedViews: 1000,
    startingPrice: 10_000,
    currentHighestBid: 0,
    bidsCount: 0,
    slotStart: new Date(Date.now() + 86_400_000).toISOString(),
    slotEnd: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    deadline: new Date(Date.now() + 86_400_000).toISOString(),
    status: 'open',
    winnerBidId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('타임슬롯 제안 가능 여부', () => {
  it('마감 전 open 슬롯은 제안 가능하다', () => {
    assert.equal(isTimeSlotOpen(slot({})), true);
  });

  it('마감이 지난 슬롯이나 낙찰 슬롯은 제안 가능이 아니다', () => {
    assert.equal(
      isTimeSlotOpen(slot({ deadline: new Date(Date.now() - 60_000).toISOString() })),
      false,
    );
    assert.equal(isTimeSlotOpen(slot({ status: 'awarded', winnerBidId: 'bid-1' })), false);
    assert.equal(isTimeSlotOpen(slot({ status: 'closed' })), false);
  });
});
