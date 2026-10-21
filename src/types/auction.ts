export type PlatformType =
  | 'youtube_shorts'
  | 'instagram_reels'
  | 'tiktok'
  | 'youtube'
  | 'threads'
  | 'naver_blog'
  | 'x_twitter'
  | 'other';

export type AuctionStatus =
  | 'active'
  | 'matched'
  | 'completed'
  | 'cancelled'
  | 'closed';

export type BidStatus = 'pending' | 'selected';

export interface AuctionItem {
  id: string;
  title: string;
  platform: PlatformType;
  budget: number;
  description: string;
  status: AuctionStatus;
  isBlind: boolean;
  authorId: string | null;
  authorName: string;
  winnerBidId: string | null;
  deadline: string;
  createdAt: string;
  bidsCount: number;
  leadingBidAmount?: number;
  highestBidAmount?: number;
}

export interface BidItem {
  id: string;
  auctionId: string;
  creatorId: string | null;
  creatorName: string;
  creatorChannelUrl: string;
  bidAmount: number;
  proposalText: string;
  status: BidStatus;
  createdAt: string;
  creatorRating?: number;
  creatorCompletionRate?: number;
}

export type CreateAuctionInput = Omit<
  AuctionItem,
  | 'id'
  | 'createdAt'
  | 'bidsCount'
  | 'status'
  | 'isBlind'
  | 'authorId'
  | 'authorName'
  | 'winnerBidId'
> & {
  status?: AuctionStatus;
  isBlind?: boolean;
  authorId?: string | null;
  authorName?: string;
  winnerBidId?: string | null;
};

export type CreateBidInput = Omit<BidItem, 'id' | 'createdAt' | 'status' | 'creatorId'> & {
  status?: BidStatus;
  creatorId?: string | null;
};

export interface DataResult<T> {
  data: T;
  error: string | null;
}

export function isAuctionClosed(status: AuctionStatus | undefined) {
  return status === 'closed' || status === 'matched' || status === 'completed';
}

export function isBidSelected(bid: Pick<BidItem, 'id' | 'status'>, winnerBidId?: string | null) {
  return bid.status === 'selected' || Boolean(winnerBidId && winnerBidId === bid.id);
}
