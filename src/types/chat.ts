export type ChatMessage = {
  id: string;
  auctionId: string;
  senderId: string | null;
  senderName: string;
  body: string;
  createdAt: string;
};

export type SendChatMessageInput = {
  auctionId: string;
  senderId?: string | null;
  senderName?: string;
  body: string;
};
