-- 신규 가입 시 역할을 강제로 넣지 않습니다. 온보딩에서 직접 선택합니다.
alter table public.profiles alter column role drop not null;
alter table public.profiles alter column role drop default;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role, status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(coalesce(new.email, ''), '@', 1), '회원'),
    coalesce(
      nullif(trim(new.email), ''),
      'user.' || replace(new.id::text, '-', '') || '@oauth.sponsor-auction.local'
    ),
    null,
    'active'
  )
  on conflict (id) do update
    set name = excluded.name,
        email = excluded.email;
  return new;
end;
$$;
