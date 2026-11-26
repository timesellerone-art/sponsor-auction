-- 크리에이터 상품 낙찰 이후 납품·구매 확정 컬럼과, schema.sql에 빠져 있던 RLS를 맞춥니다.

alter table public.time_slots
  add column if not exists delivery_url text,
  add column if not exists delivered_at timestamptz,
  add column if not exists purchase_confirmed_at timestamptz,
  add column if not exists is_blind boolean not null default false;

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

drop policy if exists "time_slots_confirm_winner" on public.time_slots;
create policy "time_slots_confirm_winner"
on public.time_slots for update
to authenticated
using (
  winner_bid_id is not null
  and exists (
    select 1
    from public.time_slot_bids b
    where b.id = time_slots.winner_bid_id
      and b.advertiser_id = auth.uid()
  )
)
with check (
  winner_bid_id is not null
  and exists (
    select 1
    from public.time_slot_bids b
    where b.id = time_slots.winner_bid_id
      and b.advertiser_id = auth.uid()
  )
);

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
