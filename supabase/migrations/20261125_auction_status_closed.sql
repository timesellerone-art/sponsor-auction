-- 운영 enum에 closed가 없어 award_auction / 상태 트리거가 낙찰을 전부 롤백한다.
alter type public.auction_status add value if not exists 'closed';

create or replace function public.award_auction(p_auction_id uuid, p_bid_id uuid)
returns public.auctions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction public.auctions;
  v_bid public.bids;
begin
  select * into v_auction
  from public.auctions
  where id = p_auction_id
  for update;

  if not found then
    raise exception '해당 경매를 찾을 수 없습니다.';
  end if;

  if v_auction.is_blind then
    raise exception '블라인드된 역경매는 낙찰할 수 없습니다.';
  end if;

  if v_auction.winner_bid_id is not null and v_auction.winner_bid_id is distinct from p_bid_id then
    raise exception '이미 낙찰 완료된 역경매입니다.';
  end if;

  select * into v_bid
  from public.bids
  where id = p_bid_id and auction_id = p_auction_id
  for update;

  if not found then
    raise exception '해당 제안을 찾을 수 없습니다.';
  end if;

  update public.bids
  set status = 'selected'
  where id = p_bid_id
    and auction_id = p_auction_id
    and status in ('pending', 'selected');

  update public.auctions
  set status = 'closed',
      winner_bid_id = p_bid_id
  where id = p_auction_id
    and winner_bid_id is null
    and status = 'active'
  returning * into v_auction;

  if not found then
    select * into v_auction
    from public.auctions
    where id = p_auction_id
      and winner_bid_id = p_bid_id;
  end if;

  if v_auction.winner_bid_id is distinct from p_bid_id then
    raise exception '이미 낙찰 완료된 역경매입니다.';
  end if;

  return v_auction;
end;
$$;
