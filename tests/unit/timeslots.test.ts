import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { timeslotAdminLifecycle } from '../../src/lib/timeslot-admin';
import {
  isTimeSlotOpen,
  isTimeslotAwaitingPayment,
  isTimeslotEscrowed,
  type TimeSlotItem,
} from '../../src/types/timeslot';

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

describe('크리에이터 상품 결제 시점', () => {
  it('낙찰 선정만 되면 결제 대기이고, 결제가 끝나면 에스크로로 본다', () => {
    const awarded = slot({ status: 'awarded', winnerBidId: 'bid-1', paidAt: null });
    assert.equal(isTimeslotAwaitingPayment(awarded), true);
    assert.equal(isTimeslotEscrowed(awarded), false);
    assert.equal(timeslotAdminLifecycle(awarded), 'awaiting_payment');

    const paid = slot({
      status: 'awarded',
      winnerBidId: 'bid-1',
      paidAt: new Date().toISOString(),
    });
    assert.equal(isTimeslotAwaitingPayment(paid), false);
    assert.equal(isTimeslotEscrowed(paid), true);
    assert.equal(timeslotAdminLifecycle(paid), 'awarded');
  });

  it('제안 가능 슬롯은 결제 대기가 아니다', () => {
    assert.equal(isTimeslotAwaitingPayment(slot({})), false);
    assert.equal(timeslotAdminLifecycle(slot({})), 'open');
  });
});
