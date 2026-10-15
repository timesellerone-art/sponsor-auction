import { isAuctionClosed, type AuctionItem, type PlatformType } from '@/types/auction';

export type BrowsePlatformFilter = 'all' | Exclude<PlatformType, 'other'>;

export type BrowseSort = 'newest' | 'budget_desc' | 'deadline_asc';

export function isOpenForBid(auction: Pick<AuctionItem, 'status' | 'isBlind'>) {
  return auction.status === 'active' && !auction.isBlind;
}

export function matchesAuctionQuery(
  auction: Pick<AuctionItem, 'title' | 'description'>,
  query: string,
) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  return `${auction.title} ${auction.description}`.toLowerCase().includes(needle);
}

export function matchesPlatformFilter(
  auction: Pick<AuctionItem, 'platform'>,
  platform: BrowsePlatformFilter,
) {
  if (platform === 'all') {
    return true;
  }

  return auction.platform === platform;
}

function deadlineValue(deadline: string | undefined) {
  if (!deadline) {
    return Number.POSITIVE_INFINITY;
  }
  const time = Date.parse(deadline);
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

export function sortAuctions(auctions: AuctionItem[], sort: BrowseSort) {
  const copy = [...auctions];
  copy.sort((left, right) => {
    if (sort === 'budget_desc') {
      return (right.budget ?? 0) - (left.budget ?? 0);
    }
    if (sort === 'deadline_asc') {
      return deadlineValue(left.deadline) - deadlineValue(right.deadline);
    }
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
  return copy;
}

export function browseAuctions(
  auctions: AuctionItem[],
  options: {
    query: string;
    platform: BrowsePlatformFilter;
    sort: BrowseSort;
  },
) {
  const filtered = auctions.filter(
    (auction) =>
      matchesAuctionQuery(auction, options.query) &&
      matchesPlatformFilter(auction, options.platform),
  );

  return {
    open: sortAuctions(filtered.filter((auction) => isOpenForBid(auction)), options.sort),
    closed: sortAuctions(
      filtered.filter((auction) => isAuctionClosed(auction.status) || auction.status === 'cancelled'),
      options.sort,
    ),
  };
}
