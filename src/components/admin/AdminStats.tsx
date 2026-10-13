import { EyeOff, Gavel, PlayCircle, Users } from 'lucide-react';

const numberFormatter = new Intl.NumberFormat('ko-KR');

type AdminStatsProps = {
  auctionCount: number;
  activeAuctionCount: number;
  advertiserCount: number;
  creatorCount: number;
  blindedCount: number;
};

export function AdminStats({
  auctionCount,
  activeAuctionCount,
  advertiserCount,
  creatorCount,
  blindedCount,
}: AdminStatsProps) {
  const memberTotal = advertiserCount + creatorCount;
  const cards = [
    {
      label: '총 역경매 수',
      value: numberFormatter.format(auctionCount),
      hint: `진행 중 ${numberFormatter.format(activeAuctionCount)}건`,
      icon: Gavel,
    },
    {
      label: '진행 중인 역경매 수',
      value: numberFormatter.format(activeAuctionCount),
      hint: '블라인드되지 않은 진행중 캠페인',
      icon: PlayCircle,
    },
    {
      label: '전체 가입 회원 수',
      value: numberFormatter.format(memberTotal),
      hint: `광고주 ${numberFormatter.format(advertiserCount)} / 크리에이터 ${numberFormatter.format(creatorCount)}`,
      icon: Users,
    },
    {
      label: '블라인드 처리된 게시글 수',
      value: numberFormatter.format(blindedCount),
      hint: '관리자가 숨김 처리한 캠페인',
      icon: EyeOff,
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => (
        <article
          key={card.label}
          className="min-w-0 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-500">{card.label}</p>
            <card.icon className="size-4 shrink-0 text-teal-700" aria-hidden />
          </div>
          <p className="mt-3 text-xl font-bold tracking-tight text-zinc-950 sm:text-2xl">
            {card.value}
          </p>
          <p className="mt-1 truncate text-xs text-zinc-500">{card.hint}</p>
        </article>
      ))}
    </section>
  );
}
