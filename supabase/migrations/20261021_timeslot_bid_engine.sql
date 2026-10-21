-- 타임슬롯 인벤토리와 역경매 입찰 엔진(선두가/최고가) 컬럼

alter table if exists public.auctions
  add column if not exists leading_bid_amount integer not null default 0;
alter table if exists public.auctions
  add column if not exists highest_bid_amount integer not null default 0;

create or replace function public.refresh_auction_bid_engine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auction_id uuid;
  v_min integer;
  v_max integer;
  v_count integer;
begin
  v_auction_id := coalesce(new.auction_id, old.auction_id);
  select
    coalesce(min(bid_amount), 0),
    coalesce(max(bid_amount), 0),
    count(*)::integer
  into v_min, v_max, v_count
  from public.bids
  where auction_id = v_auction_id;

  update public.auctions
  set
    leading_bid_amount = v_min,
    highest_bid_amount = v_max,
    bids_count = v_count
  where id = v_auction_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists bids_after_insert on public.bids;
drop trigger if exists bids_refresh_engine on public.bids;
create trigger bids_refresh_engine
after insert or update or delete on public.bids
for each row
execute function public.refresh_auction_bid_engine();

do $$
begin
  if not exists (select 1 from pg_type where typname = 'time_slot_status') then
    create type public.time_slot_status as enum ('open', 'closed', 'awarded');
  end if;
end
$$;

create table if not exists public.time_slots (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles(id) on delete set null,
  creator_name text not null,
  title text not null,
  platform public.platform_type not null,
  description text not null default '',
  expected_views integer not null,
  starting_price integer not null,
  current_highest_bid integer not null default 0,
  bids_count integer not null default 0,
  slot_start timestamptz not null,
  slot_end timestamptz not null,
  deadline timestamptz not null,
  status public.time_slot_status not null default 'open',
  winner_bid_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  constraint time_slots_title_len check (char_length(trim(title)) >= 5),
  constraint time_slots_views_positive check (expected_views >= 1000),
  constraint time_slots_price_positive check (starting_price >= 10000 and starting_price <= 100000000),
  constraint time_slots_window check (slot_end > slot_start)
);

create table if not exists public.time_slot_bids (
  id uuid primary key default gen_random_uuid(),
  time_slot_id uuid not null references public.time_slots(id) on delete cascade,
  advertiser_id uuid references public.profiles(id) on delete set null,
  advertiser_name text not null,
  bid_amount integer not null,
  message text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  constraint time_slot_bids_amount_positive check (bid_amount > 0 and bid_amount <= 100000000)
);

create index if not exists time_slots_status_deadline_idx
  on public.time_slots (status, deadline);
create index if not exists time_slot_bids_slot_amount_idx
  on public.time_slot_bids (time_slot_id, bid_amount desc);

create or replace function public.refresh_timeslot_bid_engine()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot_id uuid;
  v_max integer;
  v_count integer;
begin
  v_slot_id := coalesce(new.time_slot_id, old.time_slot_id);
  select coalesce(max(bid_amount), 0), count(*)::integer
  into v_max, v_count
  from public.time_slot_bids
  where time_slot_id = v_slot_id;

  update public.time_slots
  set current_highest_bid = v_max, bids_count = v_count
  where id = v_slot_id;
  return coalesce(new, old);
end;
$$;

drop trigger if exists time_slot_bids_refresh_engine on public.time_slot_bids;
create trigger time_slot_bids_refresh_engine
after insert or update or delete on public.time_slot_bids
for each row
execute function public.refresh_timeslot_bid_engine();

alter table public.time_slots enable row level security;
alter table public.time_slot_bids enable row level security;

drop policy if exists "time_slots_select_public" on public.time_slots;
create policy "time_slots_select_public"
on public.time_slots for select
to anon, authenticated
using (true);

drop policy if exists "time_slots_insert_own" on public.time_slots;
create policy "time_slots_insert_own"
on public.time_slots for insert
to authenticated
with check (creator_id = auth.uid() or public.is_admin());

drop policy if exists "time_slots_update_own" on public.time_slots;
create policy "time_slots_update_own"
on public.time_slots for update
to authenticated
using (creator_id = auth.uid() or public.is_admin())
with check (creator_id = auth.uid() or public.is_admin());

drop policy if exists "time_slots_delete_own" on public.time_slots;
create policy "time_slots_delete_own"
on public.time_slots for delete
to authenticated
using (creator_id = auth.uid() or public.is_admin());

drop policy if exists "time_slot_bids_select_public" on public.time_slot_bids;
create policy "time_slot_bids_select_public"
on public.time_slot_bids for select
to anon, authenticated
using (true);

drop policy if exists "time_slot_bids_insert_own" on public.time_slot_bids;
create policy "time_slot_bids_insert_own"
on public.time_slot_bids for insert
to authenticated
with check (advertiser_id = auth.uid() or public.is_admin());

grant select on public.time_slots to anon, authenticated;
grant insert, update, delete on public.time_slots to authenticated;
grant select, insert, update, delete on public.time_slots to service_role;
grant select on public.time_slot_bids to anon, authenticated;
grant insert on public.time_slot_bids to authenticated;
grant select, insert, update, delete on public.time_slot_bids to service_role;

drop policy if exists "creator_metrics_select_public" on public.creator_metrics;
create policy "creator_metrics_select_public"
on public.creator_metrics for select
to anon, authenticated
using (true);
