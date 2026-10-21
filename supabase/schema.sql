-- SponsorAuction PostgreSQL schema
-- Supabase SQL Editor 또는 `supabase db push`에서 실행하세요.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type where typname = 'platform_type') then
    create type public.platform_type as enum (
      'youtube_shorts',
      'instagram_reels',
      'tiktok',
      'youtube',
      'threads',
      'naver_blog',
      'x_twitter',
      'other'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'auction_status') then
    create type public.auction_status as enum (
      'active',
      'matched',
      'completed',
      'cancelled',
      'closed'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'bid_status') then
    create type public.bid_status as enum ('pending', 'selected');
  end if;

  if not exists (select 1 from pg_type where typname = 'profile_role') then
    create type public.profile_role as enum ('advertiser', 'creator', 'admin');
  end if;

  if not exists (select 1 from pg_type where typname = 'profile_status') then
    create type public.profile_status as enum ('active', 'suspended');
  end if;

  if not exists (select 1 from pg_type where typname = 'payout_status') then
    create type public.payout_status as enum ('pending', 'paid');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type public.payment_status as enum ('pending', 'confirmed', 'failed', 'expired');
  end if;
end
$$;

alter type public.platform_type add value if not exists 'youtube';
alter type public.platform_type add value if not exists 'threads';
alter type public.platform_type add value if not exists 'naver_blog';
alter type public.platform_type add value if not exists 'x_twitter';
alter type public.platform_type add value if not exists 'other';

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role public.profile_role,
  roles public.profile_role[] not null default '{}'::public.profile_role[],
  status public.profile_status not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint profiles_email_not_empty check (char_length(trim(email)) > 3),
  constraint profiles_name_not_empty check (char_length(trim(name)) > 0)
);

alter table public.profiles alter column role drop not null;
alter table public.profiles alter column role drop default;
alter table public.profiles
  add column if not exists roles public.profile_role[] not null default '{}'::public.profile_role[];

create table if not exists public.auctions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform public.platform_type not null,
  budget integer not null,
  description text not null,
  status public.auction_status not null default 'active',
  is_blind boolean not null default false,
  author_id uuid references public.profiles(id) on delete set null,
  author_name text not null default '',
  winner_bid_id uuid,
  deadline timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  bids_count integer not null default 0,
  constraint auctions_title_len check (char_length(trim(title)) >= 5),
  constraint auctions_description_len check (char_length(trim(description)) >= 10),
  constraint auctions_budget_range check (budget >= 10000 and budget <= 100000000),
  constraint auctions_bids_count_non_negative check (bids_count >= 0)
);

create table if not exists public.bids (
  id uuid primary key default gen_random_uuid(),
  auction_id uuid not null references public.auctions(id) on delete cascade,
  creator_id uuid references public.profiles(id) on delete set null,
  creator_name text not null,
  creator_channel_url text not null,
  bid_amount integer not null,
  proposal_text text not null,
  status public.bid_status not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  constraint bids_amount_positive check (bid_amount > 0 and bid_amount <= 100000000),
  constraint bids_creator_name_not_empty check (char_length(trim(creator_name)) > 0),
  constraint bids_channel_not_empty check (char_length(trim(creator_channel_url)) > 0),
  constraint bids_proposal_len check (char_length(trim(proposal_text)) >= 20)
);

-- 이미 생성된 auctions/bids 테이블에 누락 컬럼만 추가합니다.
alter table if exists public.auctions
  add column if not exists is_blind boolean not null default false;
alter table if exists public.auctions
  add column if not exists author_id uuid;
alter table if exists public.auctions
  add column if not exists author_name text not null default '';
alter table if exists public.auctions
  add column if not exists winner_bid_id uuid;
alter table if exists public.auctions
  add column if not exists updated_at timestamptz not null default timezone('utc', now());
alter table if exists public.auctions
  add column if not exists bids_count integer not null default 0;

alter table if exists public.bids
  add column if not exists creator_id uuid;
alter table if exists public.bids
  add column if not exists status public.bid_status not null default 'pending';

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'auctions'
  ) and exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'profiles'
  ) then
    begin
      alter table public.auctions
        add constraint auctions_author_id_fkey
        foreign key (author_id) references public.profiles(id) on delete set null;
    exception
      when duplicate_object then null;
    end;
  end if;
end
$$;

create table if not exists public.payments (
  order_id text primary key,
  auction_id text not null,
  bid_id text not null,
  amount integer not null,
  order_name text not null,
  status public.payment_status not null default 'pending',
  payment_key text,
  created_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz,
  constraint payments_amount_positive check (amount > 0),
  constraint payments_order_id_len check (char_length(order_id) >= 6)
);

-- 기존 uuid 컬럼은 mock/실서비스 id를 모두 받을 수 있도록 text로 맞춥니다.
alter table if exists public.payments
  alter column auction_id type text using auction_id::text;
alter table if exists public.payments
  alter column bid_id type text using bid_id::text;

create unique index if not exists payments_payment_key_unique
  on public.payments (payment_key)
  where payment_key is not null;

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid references public.profiles(id) on delete set null,
  creator_name text not null,
  creator_email text not null default '',
  amount integer not null,
  status public.payout_status not null default 'pending',
  auction_title text not null default '',
  requested_at timestamptz not null default timezone('utc', now()),
  constraint payouts_amount_positive check (amount > 0)
);

alter table if exists public.payouts
  add column if not exists payment_order_id text;
alter table if exists public.payouts
  add column if not exists auction_id text;
alter table if exists public.payouts
  add column if not exists bid_id text;
alter table if exists public.payouts
  add column if not exists paid_at timestamptz;
alter table if exists public.payouts
  add column if not exists admin_memo text not null default '';
alter table if exists public.payouts
  add column if not exists bank_account text not null default '';

do $$
begin
  alter table public.payouts
    add constraint payouts_payment_order_id_key unique (payment_order_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'auctions_winner_bid_id_fkey'
  ) then
    alter table public.auctions
      add constraint auctions_winner_bid_id_fkey
      foreign key (winner_bid_id) references public.bids(id) on delete set null;
  end if;
end
$$;

-- 낙찰은 active 행에서만 한 번 가능하도록 부분 유니크 인덱스·트리거
create unique index if not exists auctions_winner_bid_unique
  on public.auctions (winner_bid_id)
  where winner_bid_id is not null;

create unique index if not exists bids_one_selected_per_auction
  on public.bids (auction_id)
  where status = 'selected';

create unique index if not exists bids_one_per_creator_id
  on public.bids (auction_id, creator_id)
  where creator_id is not null;

create unique index if not exists bids_one_per_creator_name
  on public.bids (auction_id, lower(creator_name));

create index if not exists auctions_status_active_idx
  on public.auctions (id)
  where status = 'active';

create index if not exists auctions_created_at_idx
  on public.auctions (created_at desc);

create index if not exists auctions_author_id_idx
  on public.auctions (author_id);

create index if not exists bids_auction_id_idx
  on public.bids (auction_id);

create index if not exists bids_creator_id_idx
  on public.bids (creator_id);

create index if not exists profiles_created_at_idx
  on public.profiles (created_at desc);

create index if not exists payouts_requested_at_idx
  on public.payouts (requested_at desc);

create or replace function public.touch_auction_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists auctions_set_updated_at on public.auctions;
create trigger auctions_set_updated_at
before update on public.auctions
for each row
execute function public.touch_auction_updated_at();

create or replace function public.guard_auction_award()
returns trigger
language plpgsql
as $$
begin
  if new.winner_bid_id is distinct from old.winner_bid_id
     and old.winner_bid_id is not null then
    raise exception '이미 낙찰된 역경매입니다.';
  end if;

  if new.status is distinct from old.status
     and new.status in ('closed', 'matched', 'completed')
     and old.status <> 'active' then
    raise exception 'active 상태가 아닌 역경매는 낙찰/마감할 수 없습니다.';
  end if;

  if new.winner_bid_id is not null
     and old.winner_bid_id is null
     and old.status <> 'active' then
    raise exception 'active 상태가 아닌 역경매는 낙찰할 수 없습니다.';
  end if;

  if new.status is distinct from old.status
     and new.status = 'completed'
     and auth.role() is distinct from 'service_role' then
    raise exception '결제 완료 상태(completed)는 서버에서만 변경할 수 있습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists auctions_guard_award on public.auctions;
create trigger auctions_guard_award
before update of status, winner_bid_id on public.auctions
for each row
execute function public.guard_auction_award();

create or replace function public.guard_bid_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and new.status = 'selected'
     and auth.role() is distinct from 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception '입찰 낙찰 상태(selected)는 서버에서만 변경할 수 있습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists bids_guard_status on public.bids;
create trigger bids_guard_status
before update of status on public.bids
for each row
execute function public.guard_bid_status();

create or replace function public.increment_auction_bids_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.auctions
  set bids_count = bids_count + 1
  where id = new.auction_id;
  return new;
end;
$$;

drop trigger if exists bids_after_insert on public.bids;
create trigger bids_after_insert
after insert on public.bids
for each row
execute function public.increment_auction_bids_count();

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

  if v_auction.status <> 'active' or v_auction.winner_bid_id is not null then
    raise exception '이미 낙찰 완료된 역경매입니다.';
  end if;

  select * into v_bid
  from public.bids
  where id = p_bid_id and auction_id = p_auction_id
  for update;

  if not found then
    raise exception '해당 제안을 찾을 수 없습니다.';
  end if;

  if v_bid.status = 'selected' then
    raise exception '이미 낙찰 완료된 역경매입니다.';
  end if;

  update public.bids
  set status = 'selected'
  where id = p_bid_id
    and auction_id = p_auction_id
    and status = 'pending';

  if not found then
    raise exception '이미 낙찰 완료된 역경매입니다.';
  end if;

  update public.auctions
  set status = 'closed',
      winner_bid_id = p_bid_id
  where id = p_auction_id
    and status = 'active'
    and winner_bid_id is null
  returning * into v_auction;

  if not found then
    raise exception '이미 낙찰 완료된 역경매입니다.';
  end if;

  return v_auction;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, roles, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1), '회원'),
    coalesce(
      nullif(trim(new.email), ''),
      'user.' || replace(new.id::text, '-', '') || '@oauth.sponsor-auction.local'
    ),
    null,
    '{}'::public.profile_role[],
    'active'
  )
  on conflict (id) do update
    set name = excluded.name,
        email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.auctions enable row level security;
alter table public.bids enable row level security;
alter table public.payouts enable row level security;
alter table public.payments enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and (
        role = 'admin'
        or 'admin' = any(roles)
      )
  );
$$;

drop policy if exists "payments_select_public" on public.payments;
drop policy if exists "payments_insert_public" on public.payments;
drop policy if exists "payments_update_public" on public.payments;
drop policy if exists "payments_select_own" on public.payments;

create policy "payments_select_own"
on public.payments for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.auctions a
    where a.id::text = payments.auction_id
      and a.author_id = auth.uid()
  )
  or exists (
    select 1
    from public.bids b
    where b.id::text = payments.bid_id
      and b.creator_id = auth.uid()
  )
);

revoke all on public.payments from anon;
revoke insert, update, delete on public.payments from authenticated;
grant select on public.payments to authenticated;
grant select, insert, update, delete on public.payments to service_role;

drop policy if exists "profiles_select_public" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_authenticated" on public.profiles;
create policy "profiles_update_authenticated"
on public.profiles for update
to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

drop policy if exists "auctions_select_public" on public.auctions;
create policy "auctions_select_public"
on public.auctions for select
to anon, authenticated
using (true);

drop policy if exists "auctions_insert_public" on public.auctions;
drop policy if exists "auctions_insert_own" on public.auctions;
create policy "auctions_insert_own"
on public.auctions for insert
to authenticated
with check (
  author_id = auth.uid()
  and char_length(trim(title)) >= 5
  and char_length(trim(description)) >= 10
  and budget >= 10000
);

drop policy if exists "auctions_update_authenticated" on public.auctions;
drop policy if exists "auctions_update_own" on public.auctions;
create policy "auctions_update_own"
on public.auctions for update
to authenticated
using (author_id = auth.uid() or public.is_admin())
with check (author_id = auth.uid() or public.is_admin());

drop policy if exists "auctions_delete_authenticated" on public.auctions;
drop policy if exists "auctions_delete_own" on public.auctions;
create policy "auctions_delete_own"
on public.auctions for delete
to authenticated
using (author_id = auth.uid() or public.is_admin());

drop policy if exists "bids_select_public" on public.bids;
drop policy if exists "bids_select_related" on public.bids;
create policy "bids_select_related"
on public.bids for select
to authenticated
using (
  public.is_admin()
  or creator_id = auth.uid()
  or exists (
    select 1
    from public.auctions a
    where a.id = bids.auction_id
      and a.author_id = auth.uid()
  )
);

drop policy if exists "bids_insert_public" on public.bids;
drop policy if exists "bids_insert_own" on public.bids;
create policy "bids_insert_own"
on public.bids for insert
to authenticated
with check (
  creator_id = auth.uid()
  and bid_amount > 0
  and char_length(trim(creator_name)) > 0
  and char_length(trim(creator_channel_url)) > 0
  and char_length(trim(proposal_text)) >= 20
);

drop policy if exists "bids_update_authenticated" on public.bids;
drop policy if exists "bids_update_related" on public.bids;
create policy "bids_update_related"
on public.bids for update
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.auctions a
    where a.id = bids.auction_id
      and a.author_id = auth.uid()
  )
  or (creator_id = auth.uid() and status = 'pending')
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.auctions a
    where a.id = bids.auction_id
      and a.author_id = auth.uid()
  )
  or (creator_id = auth.uid() and status = 'pending')
);

drop policy if exists "payouts_select_public" on public.payouts;
drop policy if exists "payouts_select_own" on public.payouts;
create policy "payouts_select_own"
on public.payouts for select
to authenticated
using (public.is_admin() or creator_id = auth.uid());

drop policy if exists "payouts_update_authenticated" on public.payouts;
drop policy if exists "payouts_update_admin" on public.payouts;
create policy "payouts_update_admin"
on public.payouts for update
to authenticated, service_role
using (public.is_admin() or auth.role() = 'service_role')
with check (public.is_admin() or auth.role() = 'service_role');

drop policy if exists "payouts_insert_admin" on public.payouts;
create policy "payouts_insert_admin"
on public.payouts for insert
to authenticated
with check (public.is_admin());

grant execute on function public.award_auction(uuid, uuid) to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.payouts to authenticated, service_role;

create table if not exists public.tax_invoice_logs (
  id uuid primary key default gen_random_uuid(),
  payout_id text,
  payment_order_id text,
  auction_id text,
  bid_id text,
  supply_amount integer not null default 0,
  vat_amount integer not null default 0,
  withholding_amount integer not null default 0,
  net_payout integer not null default 0,
  status text not null default 'fallback',
  provider text not null default 'popbill',
  mgt_key text,
  payload jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.tax_invoice_logs enable row level security;
drop policy if exists "tax_invoice_logs_admin" on public.tax_invoice_logs;
create policy "tax_invoice_logs_admin"
on public.tax_invoice_logs for all
to authenticated, service_role
using (public.is_admin() or auth.role() = 'service_role')
with check (public.is_admin() or auth.role() = 'service_role');
grant select, insert on public.tax_invoice_logs to authenticated, service_role;

revoke insert, update, delete on public.auctions from anon;
revoke insert, update, delete on public.bids from anon;
revoke select on public.profiles from anon;
revoke update, delete on public.profiles from anon;
revoke select, update, delete on public.payouts from anon;
revoke execute on function public.award_auction(uuid, uuid) from anon;
