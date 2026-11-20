-- 크레딧 원장 고강도 검증: 중복 reference 안정 에러, RELEASE/REFUND 복원 RPC.

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

  begin
    insert into public.credit_transactions (
      user_id, type, amount, balance_after, reference_id, description
    )
    values (
      p_user_id, 'CHARGE', p_amount, v_balance, nullif(trim(p_reference_id), ''), p_description
    )
    returning id into v_tx_id;
  exception
    when unique_violation then
      raise exception 'duplicate_credit_reference' using errcode = 'P0004';
  end;

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

  begin
    insert into public.credit_transactions (
      user_id, type, amount, balance_after, reference_id, description
    )
    values (
      p_user_id, v_type, p_amount, v_balance, nullif(trim(p_reference_id), ''), p_description
    )
    returning id into v_tx_id;
  exception
    when unique_violation then
      raise exception 'duplicate_credit_reference' using errcode = 'P0004';
  end;

  return jsonb_build_object(
    'balance_after', v_balance,
    'transaction_id', v_tx_id,
    'type', v_type
  );
end;
$$;

create or replace function public.restore_user_credit(
  p_user_id uuid,
  p_amount integer,
  p_type text,
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
  v_type := upper(trim(coalesce(p_type, '')));
  if v_type not in ('RELEASE', 'REFUND') then
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

  v_balance := v_balance + p_amount;

  update public.profiles
     set credit_balance = v_balance
   where id = p_user_id;

  begin
    insert into public.credit_transactions (
      user_id, type, amount, balance_after, reference_id, description
    )
    values (
      p_user_id, v_type, p_amount, v_balance, nullif(trim(p_reference_id), ''), p_description
    )
    returning id into v_tx_id;
  exception
    when unique_violation then
      raise exception 'duplicate_credit_reference' using errcode = 'P0004';
  end;

  return jsonb_build_object(
    'balance_after', v_balance,
    'transaction_id', v_tx_id,
    'type', v_type
  );
end;
$$;

revoke all on function public.charge_user_credit(uuid, integer, text, text) from public, anon, authenticated;
revoke all on function public.deduct_user_credit(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.restore_user_credit(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.charge_user_credit(uuid, integer, text, text) to service_role;
grant execute on function public.deduct_user_credit(uuid, integer, text, text, text) to service_role;
grant execute on function public.restore_user_credit(uuid, integer, text, text, text) to service_role;
