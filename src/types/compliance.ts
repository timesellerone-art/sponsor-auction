export type ComplianceSource = 'bid' | 'chat' | 'timeslot_bid';

export type ComplianceLog = {
  id: string;
  source: ComplianceSource;
  keywords: string[];
  snippet: string;
  blocked: boolean;
  actorId: string | null;
  auctionId: string | null;
  createdAt: string;
};

export type RecordBypassInput = {
  text: string;
  source: ComplianceSource;
  actorId?: string | null;
  auctionId?: string | null;
  blocked?: boolean;
};
