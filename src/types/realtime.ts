export const REALTIME_TABLES = ['chat_messages', 'bids', 'time_slot_bids'] as const;

export type RealtimeTable = (typeof REALTIME_TABLES)[number];

export type RealtimeChange = {
  table: RealtimeTable;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  record: Record<string, unknown>;
  oldRecord: Record<string, unknown> | null;
};

export const CHAT_INSERTED_EVENT = 'chat:inserted';
export const REALTIME_CHANGED_EVENT = 'realtime:changed';

export type ChatInsertedDetail = {
  auctionId: string;
  id: string;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
};
