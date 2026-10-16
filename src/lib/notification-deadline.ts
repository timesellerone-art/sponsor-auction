import 'server-only';

import {
  deadlineNotifyKey,
  deliverLifecycleNotification,
  markDeadlineNotified,
  shouldNotifyDeadline,
  wasDeadlineNotified,
} from '@/lib/notification';
import { createAdminClient } from '@/lib/supabase/admin';

export async function notifyUpcomingDeadlines() {
  const client = createAdminClient();
  if (!client) {
    console.info('[Notification Mock]', {
      event: 'auction_deadline',
      reason: 'service role 없음, 마감 임박 스캔 생략',
    });
    return { scanned: 0, sent: 0 };
  }

  const { data, error } = await client
    .from('auctions')
    .select('id, title, author_id, author_name, deadline, status')
    .eq('status', 'active');
  if (error) {
    console.warn('[SponsorAuction] 마감 임박 경매 조회 실패', error.message);
    return { scanned: 0, sent: 0 };
  }

  let sent = 0;
  const auctions = data ?? [];
  for (const auction of auctions) {
    if (!shouldNotifyDeadline(auction.deadline)) {
      continue;
    }
    const key = deadlineNotifyKey(auction.id);
    if (wasDeadlineNotified(key)) {
      continue;
    }
    markDeadlineNotified(key);

    await deliverLifecycleNotification({
      event: 'auction_deadline',
      auctionId: auction.id,
      auctionTitle: auction.title,
      toName: auction.author_name,
      toUserId: auction.author_id,
    });
    sent += 1;

    const bids = await client
      .from('bids')
      .select('creator_id, creator_name')
      .eq('auction_id', auction.id);
    for (const bid of bids.data ?? []) {
      await deliverLifecycleNotification({
        event: 'auction_deadline',
        auctionId: auction.id,
        auctionTitle: auction.title,
        toName: bid.creator_name,
        toUserId: bid.creator_id,
      });
      sent += 1;
    }
  }

  return { scanned: auctions.length, sent };
}
