-- auth.users 생성이 profiles 제약(이메일 unique, 이름 not empty) 때문에
-- "Database error saving new user"로 실패하지 않도록 트리거를 보강한다.

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
