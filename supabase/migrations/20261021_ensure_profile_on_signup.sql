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
    case
      when new.raw_user_meta_data ->> 'role' in ('advertiser', 'creator', 'admin')
        then (new.raw_user_meta_data ->> 'role')::public.profile_role
      else null
    end,
    'active'
  )
  on conflict (id) do update
    set name = excluded.name,
        email = excluded.email,
        role = coalesce(excluded.role, public.profiles.role);
  return new;
end;
$$;
