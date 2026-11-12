import Link from 'next/link';
import {
  closedCampaignBadge,
  platformBadgeLabel,
} from '@/lib/campaign-presentation';
import { formatWon } from '@/lib/utils';
import type { AuctionItem } from '@/types/auction';

export function ClosedCampaignRow({ auction }: { auction: AuctionItem }) {
  const href = `/auctions/${auction.id}`;
  const title = auction.title || '제목 없음';

  return (
    <Link
      href={href}
      className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white sm:px-3"
    >
      <span className="hidden shrink-0 rounded-full bg-[#1C1917] px-2 py-0.5 text-[10px] font-semibold text-white sm:inline-flex">
        {platformBadgeLabel(auction.platform)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#1C1917]">{title}</span>
      <span className="shrink-0 rounded-full bg-[#FFF7ED] px-2 py-0.5 text-[10px] font-semibold text-[#EA580C]">
        {closedCampaignBadge(auction.status)}
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums tracking-tight text-[#1C1917]">
        {formatWon(auction.budget ?? 0)}
      </span>
    </Link>
  );
}
