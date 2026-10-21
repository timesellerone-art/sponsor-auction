export const NOTIFICATION_TYPES = [
  'bid_received',
  'award_complete',
  'payment_complete',
  'chat_message',
  'timeslot_bid',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export type AppNotification = {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
};
