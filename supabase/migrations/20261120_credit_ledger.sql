-- 선불 크레딧 원장 1단계: 잔액 컬럼, 거래 로그, 원자적 충전/차감 RPC.

alter table public.profiles
  add column if not exists credit_balance integer not null default 0;

alter table public.profiles
  drop constraint if exists profiles_credit_balance_nonneg;

alter table public.profiles
  add constraint profiles_credit_balance_nonneg check (credit_balance >= 0);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('CHARGE', 'HOLD', 'RELEASE', 'REFUND')),
  amount integer not null check (amount > 0),
  balance_after integer not null check (balance_after >= 0),
  reference_id text,
  description text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists credit_transactions_user_created_idx
  on public.credit_transactions (user_id, created_at desc);

create unique index if not exists credit_transactions_user_type_ref_idx
  on public.credit_transactions (user_id, type, reference_id)
  where reference_id is not null and char_length(trim(reference_id)) > 0;

alter table public.credit_transactions enable row level security;

drop policy if exists "credit_transactions_select_own" on public.credit_transactions;
create policy "credit_transactions_select_own"
on public.credit_transactions for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

revoke all on public.credit_transactions from anon, authenticated;
grant select on public.credit_transactions to authenticated;
grant select, insert, update, delete on public.credit_transactions to service_role;

create or replace function public.guard_credit_balance_mutation()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.credit_balance is distinct from old.credit_balance then
    if current_setting('app.credit_mutation', true) = 'on' then
      return new;
    end if;
    if auth.role() = 'service_role' then
      return new;
    end if;
    raise exception 'credit_balance can only be changed via credit RPCs'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_credit_balance_mutation on public.profiles;
create trigger trg_guard_credit_balance_mutation
before update of credit_balance on public.profiles
for each row
execute procedure public.guard_credit_balance_mutation();

create or replace function public.charge_user_credit(
  p_user_id uuid,
  p_amount integer,
  p_reference_id text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_tx_id uuid;
begin
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'invalid_credit_amount' using errcode = 'P0001';
  end if;

  perform set_config('app.credit_mutation', 'on', true);

  select credit_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  v_balance := v_balance + p_amount;

  update public.profiles
     set credit_balance = v_balance
   where id = p_user_id;

  insert into public.credit_transactions (
    user_id, type, amount, balance_after, reference_id, description
  )
  values (
    p_user_id, 'CHARGE', p_amount, v_balance, nullif(trim(p_reference_id), ''), p_description
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'balance_after', v_balance,
    'transaction_id', v_tx_id,
    'type', 'CHARGE'
  );
end;
$$;

create or replace function public.deduct_user_credit(
  p_user_id uuid,
  p_amount integer,
  p_type text default 'HOLD',
  p_reference_id text default null,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_tx_id uuid;
  v_type text;
begin
  v_type := upper(trim(coalesce(p_type, 'HOLD')));
  if v_type <> 'HOLD' then
    raise exception 'invalid_credit_type' using errcode = 'P0001';
  end if;
  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'invalid_credit_amount' using errcode = 'P0001';
  end if;

  perform set_config('app.credit_mutation', 'on', true);

  select credit_balance into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  if v_balance < p_amount then
    raise exception 'insufficient_credit' using errcode = 'P0003';
  end if;

  v_balance := v_balance - p_amount;

  update public.profiles
     set credit_balance = v_balance
   where id = p_user_id;

  insert into public.credit_transactions (
    user_id, type, amount, balance_after, reference_id, description
  )
  values (
    p_user_id, v_type, p_amount, v_balance, nullif(trim(p_reference_id), ''), p_description
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'balance_after', v_balance,
    'transaction_id', v_tx_id,
    'type', v_type
  );
end;
$$;

revoke all on function public.charge_user_credit(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.deduct_user_credit(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.charge_user_credit(uuid, integer, text, text) to service_role;
grant execute on function public.deduct_user_credit(uuid, integer, text, text, text) to service_role;
