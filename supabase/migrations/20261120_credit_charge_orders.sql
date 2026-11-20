-- 크레딧 충전 주문. 캠페인 결제(payments)와 분리하고, 승인 금액은 이 행의 amount와 비교한다.

create table if not exists public.credit_charge_orders (
  order_id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed', 'cancelled')),
  payment_key text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint credit_charge_orders_amount_positive check (amount > 0),
  constraint credit_charge_orders_order_id_prefix check (order_id like 'crd_%'),
  constraint credit_charge_orders_order_id_len check (char_length(order_id) >= 8)
);

create unique index if not exists credit_charge_orders_payment_key_idx
  on public.credit_charge_orders (payment_key)
  where payment_key is not null;

create index if not exists credit_charge_orders_user_created_idx
  on public.credit_charge_orders (user_id, created_at desc);

alter table public.credit_charge_orders enable row level security;

drop policy if exists "credit_charge_orders_select_own" on public.credit_charge_orders;
create policy "credit_charge_orders_select_own"
on public.credit_charge_orders for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

revoke all on public.credit_charge_orders from anon, authenticated;
grant select on public.credit_charge_orders to authenticated;
grant select, insert, update, delete on public.credit_charge_orders to service_role;
