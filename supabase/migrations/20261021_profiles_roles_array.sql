-- 한 계정이 광고주/크리에이터 등 여러 역할을 동시에 가질 수 있게 roles 배열을 추가합니다.
-- 기존 role 컬럼은 대표 역할(호환용)로 유지합니다.

alter table public.profiles
  add column if not exists roles public.profile_role[] not null default '{}'::public.profile_role[];

update public.profiles
set roles = array[role]::public.profile_role[]
where role is not null
  and cardinality(roles) = 0;

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
