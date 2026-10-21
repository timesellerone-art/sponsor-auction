-- 소셜/이메일 가입 직후 역할을 고를 수 있도록 profiles.role을 비워 둡니다.
alter table public.profiles alter column role drop not null;

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
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1), '회원'),
    coalesce(new.email, ''),
    case
      when new.raw_user_meta_data ->> 'role' in ('advertiser', 'creator', 'admin')
        then (new.raw_user_meta_data ->> 'role')::public.profile_role
      else null
    end,
    'active'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
