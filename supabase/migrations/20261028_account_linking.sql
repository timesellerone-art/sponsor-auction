-- 소셜 계정 통합(Account Linking)에 필요한 DB 변경을 한 번에 적용한다.
-- 20261028_profiles_phone.sql, 20261028_handle_new_user_resilient.sql 내용을 포함하며 여러 번 실행해도 안전하다.

-- 1) 대표 전화번호
alter table if exists public.profiles
  add column if not exists phone text;

create unique index if not exists profiles_phone_unique
  on public.profiles (phone)
  where phone is not null and char_length(trim(phone)) > 0;

-- 2) 가입 트리거: profiles 제약 때문에 auth.users 생성이 실패하지 않도록 한다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_placeholder text := 'user.' || replace(new.id::text, '-', '') || '@oauth.sponsor-auction.local';
  v_email text := nullif(lower(trim(coalesce(new.email, ''))), '');
  v_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'preferred_username'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    '회원'
  );
begin
  if v_email is null
    or exists (select 1 from public.profiles p where lower(p.email) = v_email and p.id <> new.id) then
    v_email := v_placeholder;
  end if;

  begin
    insert into public.profiles (id, name, email, role, roles, status)
    values (new.id, v_name, v_email, null, '{}'::public.profile_role[], 'active')
    on conflict (id) do update
      set name = excluded.name,
          email = excluded.email;
  exception when others then
    raise warning 'handle_new_user: profile insert skipped for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- 3) auth.users 삭제 시 profiles도 삭제해 고아 행을 남기지 않는다.
create or replace function public.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$$;

drop trigger if exists on_auth_user_deleted on auth.users;
create trigger on_auth_user_deleted
after delete on auth.users
for each row
execute function public.handle_deleted_user();

-- 4) 이미 남아 있는 고아 profiles 정리
delete from public.profiles p
where not exists (select 1 from auth.users u where u.id = p.id);

-- 5) 소셜 identity를 대표 계정으로 이전한다. 이후 같은 소셜 수단으로 로그인하면 대표 계정으로 들어온다.
create or replace function public.merge_auth_identities(p_from uuid, p_to uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_moved integer;
begin
  if p_from is null or p_to is null or p_from = p_to then
    return 0;
  end if;
  if not exists (select 1 from auth.users where id = p_to) then
    raise exception 'merge target % not found', p_to;
  end if;

  update auth.identities
     set user_id = p_to,
         updated_at = now()
   where user_id = p_from
     and provider <> 'email';
  get diagnostics v_moved = row_count;
  return v_moved;
end;
$$;

revoke all on function public.merge_auth_identities(uuid, uuid) from public, anon, authenticated;
grant execute on function public.merge_auth_identities(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
